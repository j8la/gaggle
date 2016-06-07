/*
Name    : gaggle.js
Author  : Julien Blanc
Version : 0.5.0
Date    : 07/06/2016
NodeJS  : 5.11.1 / 6.1.0 / 6.2.0
*/

/*
Copyright (c) 2016 by Julien Blanc

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program.  If not, see <http://www.gnu.org/licenses/>.
*/


//----------------------------------------- LOAD MODULES

//------ External modules
var expr    = require('express');
var bdyp    = require('body-parser');
var hstd    = require('host-discovery');
var argp    = require('argparse').ArgumentParser;
var nrcl    = require('node-rest-client').Client;
var baut    = require('basic-auth');


//------ Node modules
var fs      = require('fs');
var ip      = require('ip');
var os      = require('os');
var crypt   = require('crypto');
var https   = require('https');


//----------------------------------------- EXPRESS CONFIG
var appl = expr();                       

appl.use(bdyp.json());
appl.use(bdyp.urlencoded({ extended: true }));


//----------------------------------------- HTTPS Server
var wsrv = https.createServer({
    key: fs.readFileSync('key.pem'),
    cert: fs.readFileSync('cert.pem')
}, appl);


//----------------------------------------- SERVER AUTHENTICATION
var auth = function (req, res, next) {
    
  function unauthorized(res) {
    res.set('WWW-Authenticate', 'Basic realm=Authorization Required');
    return res.sendStatus(401);
  };

  var user = baut(req);

  if (!user || !user.name || !user.pass) {
    return unauthorized(res);
  };

  if (user.name === appStruct.credentials.user && user.pass === appStruct.credentials.password) {
    return next();
  } else {
    return unauthorized(res);
  };
  
};

    
//----------------------------------------- ARGUMENTS
var parser = new argp({
    version: '0.5.0',
    addHelp: true,
    description: 'Gaggle distributed configuration service.'
})

parser.addArgument(
    ['-c', '--cluster'],
    { 
        help: 'Cluster ID for multicast discovery.',
        required: true,
        metavar: 'ID'
    }
)

var args = parser.parseArgs();


//----------------------------------------- APP STRUCTURE
var appStruct = {
    credentials: {
        user: "default",
        password: "6agg1e!!"
    },
    status: {
        sdate: Date.now(),
        suptime: null,
        hostname: os.hostname(),
        system: os.type(),
        version: os.release(),
        arch: os.arch(),
        ouptime: null,
        checksum: null
    },
    config: {
        clusterId: args.cluster,
        members: []
    },
    log: [],
    store: {}
}


//----------------------------------------- HOST DISCOVERY
var htds = new hstd({
    service: appStruct.config.clusterId,   
    protocol: 'udp4',                       
    port: 2900                              
});


//----------------------------------------- REST API CLIENT INSTANCE
var recl_options = {
    user: appStruct.credentials.user,
    password: appStruct.credentials.password,
    connection: {
        rejectUnauthorized: false
	}
}

var recl = new nrcl(recl_options);       // Rest API client


//----------------------------------------- REST API

//----------- GET
appl.get('/api/status', auth, function(req,res) {
    appStruct.status.suptime = Math.round((Date.now() - appStruct.status.sdate)/1000);
    appStruct.status.ouptime = os.uptime();
    res.send(appStruct.status);
});

appl.get('/api/status/checksum', auth, function(req,res) {
    res.send(appStruct.status.checksum);
});

appl.get('/api/config', auth, function(req,res) {
    res.send(appStruct.config);
});

appl.get('/api/log', auth, function(req,res) {
    res.send(appStruct.log);
});

appl.get('/api/config/members', auth, function(req,res) {
    res.send(appStruct.config.members);
});

appl.get('/api/store', auth, function(req,res) {
    res.send(appStruct.store);
});

appl.get('/api/store/:node', auth, function(req,res) {
    if(appStruct.store.hasOwnProperty(req.params.node)) {
        res.send(appStruct.store[req.params.node]);
    } else {
        res.sendStatus(404);
    }
});

appl.get('/api/store/:node/:key', auth, function(req,res) {
    if(appStruct.store.hasOwnProperty(req.params.node) && appStruct.store[req.params.node].hasOwnProperty(req.params.key)) {
        res.send(appStruct.store[req.params.node][req.params.key]);
    } else {
        res.sendStatus(404);
    }
});


//----------- Function refresh store
function refreshStore() {
    
    appStruct.status.checksum = getHash(JSON.stringify(appStruct.store));
    
    for(var x in appStruct.config.members) {
        if(appStruct.config.members[x].address != ip.address()) {
            var args = {
                data: { 
                    address: ip.address(), 
                    checksum: appStruct.status.checksum 
                },
                headers: { "Content-Type": "application/json" }
            }
            recl.post('https://' + appStruct.config.members[x].address + ':8000/api/store/refresh', args, function(data,res) {
                //log('NFO', 'A notification has been sent to ' + appStruct.config.members[x].address + '.');
            }).on('error', function(err) { 
                log('ERR', appStruct.config.members[x].address + ' is unreachable. The updating of the remote host failed.'); 
            });
        }
    }
    
}


//----------- POST

// Refresh
appl.post('/api/store/refresh', auth, function(req,res) {
    
    if(appStruct.status.checksum != req.body.checksum) {
        
        var rc = req.body.checksum;
        
        recl.get("https://" + req.body.address + ":8000/api/store", function(data,res) {
            
            var buffer = data;
            var lc = getHash(JSON.stringify(buffer));
            
            if(lc == rc) {
                appStruct.store = buffer;
                appStruct.status.checksum = lc;
                log('NFO','The store has been updated from ' + req.body.address + '.');
                writeStore();
            } else {
                log('ERR','An update has been detected from ' + req.body.address + ' but the store has not been updated. Checksum error.');
            }
            
            buffer = null;
            lc = null;
            
            
        }).on('error', function(err) { 
            log('ERR','An update has been detected from ' + req.body.address + ' but the store has not been updated.'); 
        });
        
    }
    
    res.sendStatus(200);
    
});

// Create node
appl.post('/api/store/:node', auth, function(req,res) {
    try {
        if(appStruct.store.hasOwnProperty(req.params.node)) {
            res.sendStatus(409);
        } else {
            if(typeof req.params.node == 'string') {
                appStruct.store[req.params.node] = {};
                refreshStore();
                writeStore();
                res.sendStatus(201);
            } else {
                res.sendStatus(400);
            }
        }
    } catch(e) {
        res.sendStatus(400);
    }
});

// Create key
appl.post('/api/store/:node/:key', auth, function(req,res) {
    try {
        if(appStruct.store.hasOwnProperty(req.params.node)) {
            if(!appStruct.store[req.params.node].hasOwnProperty(req.params.key)) {
                if(typeof req.params.key == 'string') {
                    appStruct.store[req.params.node][req.params.key] = '';
                    refreshStore();
                    writeStore();
                    res.sendStatus(201);
                } else {
                    res.sendStatus(400);
                }
            } else {
                res.sendStatus(409);
            }
        } else {
            res.sendStatus(404);
        }
    } catch(e) {
        res.sendStatus(400);
    }
});


//----------- DELETE

// Delete node
appl.delete('/api/store/:node', auth, function(req,res) {
    try {
        if(appStruct.store.hasOwnProperty(req.params.node)) {
            delete appStruct.store[req.params.node];
            refreshStore();
            writeStore();
            res.sendStatus(200);
        } else {
            res.sendStatus(404);
        }
    } catch(e) {
        res.sendStatus(400);
    }
});

// Delete key
appl.delete('/api/store/:node/:key', auth, function(req,res) {
    try {
        if(appStruct.store.hasOwnProperty(req.params.node) && appStruct.store[req.params.node].hasOwnProperty([req.params.key])) {
            delete appStruct.store[req.params.node][req.params.key];
            refreshStore();
            writeStore();
            res.sendStatus(200);
        } else {
            res.sendStatus(404);
        }
    } catch(e) {
        res.sendStatus(400);
    }
});


//----------- UPDATE
appl.put('/api/store/:node/:key', auth, function(req,res) {
    if(appStruct.store.hasOwnProperty(req.params.node) && appStruct.store[req.params.node].hasOwnProperty([req.params.key])) {
        if(typeof req.body.value != 'object' && typeof req.body.value != 'function' && typeof req.body.value != 'symbol') {
            var datajson = IsJsonString(req.body.value);
            if(datajson != null) {
                appStruct.store[req.params.node][req.params.key] = datajson;
            } else {
                appStruct.store[req.params.node][req.params.key] = req.body.value; 
            }
            refreshStore();
            writeStore();
            res.sendStatus(200);
        } else {
            res.sendStatus(400);
        }
    } else {
        res.sendStatus(404);
    }
});


//----------------------------------------- FILE OPERATIONS
function writeStore() {
    fs.writeFile('store.json', JSON.stringify(appStruct.store, null, 4), (err) => {
        if (err) {
            log('ERR','Can\'t write to store.json file.');
        } else {
            log('NFO','Store saved to store.json file.');
        }
    });
}

function loadStore() {
    fs.readFile('store.json', (err, data) => {
        if (err) {
            log('ERR','Can\'t load store.json file.');
        } else {
            appStruct.store = JSON.parse(data);
            appStruct.status.checksum = getHash(JSON.stringify(appStruct.store));
            log('NFO','Store loaded from store.json file.');
        }
    }); 
}

function loadCredentials() {
    fs.readFile('credentials.json', (err, data) => {
        if (err) {
            log('ERR','Can\'t load credentials.json file, default credentials will be used.');
        } else {
            appStruct.credentials = JSON.parse(data);
            log('NFO','Credentials loaded from credentials.json file.');
        }
    }); 
}


//----------------------------------------- HOST DISCOVERY 

//----------- Function refresh members
function refreshMembers() {
    
    var tmp = htds.hosts();
    appStruct.config.members = [];
    
    for(var entry in tmp) {
        appStruct.config.members.push(tmp[entry]);
    }
    
}


//----------- Events 
htds.on('join', (addr) => { refreshMembers(); });
htds.on('leave', (addr) => { refreshMembers(); });


//----------------------------------------- LOG
function log(type,msg) {
    
    if(appStruct.log.length > 20) {
        appStruct.log.splice(0,1);
    }
    
    appStruct.log.push({date:Date.now(),type:type,msg:msg});
    
}


//----------------------------------------- CHECKSUM
function getHash(str) {
    return crypt
        .createHash('md5')
        .update(str, 'utf8')
        .digest('hex')
}


//----------------------------------------- PROCESS EVENTS
process.on('SIGTERM', function() {
    wsrv.close({});
    htds.stop();
    process.exit(0);
})


//----------------------------------------- TEST & RETURNS JSON
function IsJsonString(str) {
    
    var json = null;
    
    try {
        json = JSON.parse(str);
    } catch (e) {
    }
    
    return json;
}


//----------------------------------------- GO!!
log('NFO','Starting...');
loadCredentials();
loadStore();

//----------- STARTS DISCOVERY
try {
    htds.start();
    log('NFO','Host Discovery module is started.');
} catch(e) {
    log('ERR','Host Discovery module Discovery can\'t start.');
}

//----------- GET STORE FORM OTHER HOST IF I'M NOT ALONE
setTimeout(function(){
    
    var tmp = htds.hosts();
    var isUpdated = false;
    
    for(var entry in tmp) {
        
        if(entry != ip.address()) {
            
            if(isUpdated == true) {
                
                break;
                
            } else {
                
                log('NFO','Updating store from an existing host...');
                
                recl.get("https://" + entry + ":8000/api/status/checksum", function(data,res) {
                    
                    var rc = data;
                    
                    if(appStruct.status.checksum != rc) {
                    
                        recl.get("https://" + entry + ":8000/api/store", function(data,res) {
                            
                            var buffer = data;
                            var lc = getHash(JSON.stringify(buffer));
                            
                            if(lc == rc) {
                                appStruct.store = data;
                                appStruct.status.checksum = lc;
                                log('NFO','The store is updated from ' + entry + '.');
                                writeStore();
                                isUpdated = true;
                            } else {
                                log('ERR','The store can\'t be updated.');
                            }
                            
                            buffer = null;
                            lc = null;
                            
                        }).on('error', function(err) {
                            log('WAR', entry + ' is starting at the same time.');
                        })
                        
                    } else {
                        log('NFO','The store is already up to date.');
                    }
                    
                }).on('error', function(err) { 
                    log('ERR', entry + ' is unreachable. Can\'t get checksum and update store.'); 
                });
                    
            }
            
        }
         
    }
    
    
    //----------- EXPRESS LISTENING
    wsrv.listen(8000);
    
    log('NFO','API is listening on ' + ip.address() + ':8000');
    
}, 6000);