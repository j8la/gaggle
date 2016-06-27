/*
Name    : manada.js
Author  : Julien Blanc
Version : 0.7.3
Date    : 27/06/2016
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
var asyn    = require('async');


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
    version: '0.7.3',
    addHelp: true,
    description: 'Manada distributed configuration service.'
})

parser.addArgument(
    ['-c', '--cluster'],
    { 
        help: 'Cluster ID for multicast discovery.',
        required: true,
        metavar: 'ID'
    }
)

parser.addArgument(
    ['-d', '--dev'],
    { 
        help: 'Development options.',
        required: false,
        metavar: 'OPT'
    }
)

var args = parser.parseArgs();


//----------------------------------------- DEV OPTIONS
var norepl = false;

if(args.dev == 'norepl') {
    norepl = true;
}


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
        checksum: "0",
        isolated: false
    },
    config: {
        clusterId: args.cluster,
        members: [],
        blacklist: []
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


//----------------------------------------- FUNCTIONS

//----------- Push update to cluster members
function pushUpdate(body, path, method) {

    if(!body.from) {

        var args = {
            data: { 
                from: ip.address(),
                checksum: appStruct.status.checksum 
            },
            headers: { "Content-Type": "application/json" }
        }

        for(var x in appStruct.config.members) {

            if(appStruct.config.members[x].address != ip.address()) {

                if(appStruct.config.blacklist.indexOf(appStruct.config.members[x].address) == -1) {

                    if(norepl == false) {

                        var errMsg  = appStruct.config.members[x].address + ' is unreachable. The updating of the remote host failed.';
                        var uri     = 'https://' + appStruct.config.members[x].address + ':8000' + path;

                        switch(method) {
                            case 'POST' :
                                recl.post(uri, args, function(data,res) {}).on('error', function(err) { 
                                    log('ERR', errMsg); 
                                });
                                break;
                            case 'DELETE' :
                                recl.delete(uri, args, function(data,res) {}).on('error', function(err) { 
                                    log('ERR', errMsg); 
                                });
                                break;
                            case 'UPDATE' :
                                args.data.value = body.value;
                                recl.put(uri, args, function(data,res) {}).on('error', function(err) { 
                                    log('ERR', errMsg); 
                                });
                                break;
                        }

                    }

                }

            }

        }

    } else {

        if(body.checksum != appStruct.status.checksum) {
            log('ERR','Checksum error, the update has failed (' + method + ').');
            updateRemoteBlacklist('ADD',ip.address());
            appStruct.status.isolated = true;
            log('ERR','This instance is now isolated from cluster.');
            log('NFO', 'Try to resync the store.');
        } else {
            appStruct.status.isolated = false;
            log('NFO', body.from + ' has pushed an update (' + method + ') with success.');
        }

    }

}


//----------- Treatment of received updates
function treatUpdate(params,body,path,method) {

    if(method == 'POST') {

        pathLength = path.split("/").length;

        switch (pathLength) {
            case 4 :
                appStruct.store[params.node] = {};
                break;
            case 5 :
                appStruct.store[params.node][params.key] = '';
                break;
        }   

    }

    if(method == 'UPDATE') {

        var datajson = IsJsonString(body.value);

        if(datajson != null) {
            appStruct.store[params.node][params.key] = datajson;
        } else {
            appStruct.store[params.node][params.key] = body.value; 
        }

    }

    if(method == 'DELETE') {

        pathLength = path.split("/").length;

        switch (pathLength) {
            case 4 :
                delete appStruct.store[params.node];
                break;
            case 5 :
                delete appStruct.store[params.node][params.key];
                break;
        }

    }

    checksumCalculation();
    writeStore();
    pushUpdate(body,path,method);

}


//----------- Checksum
function getHash(str) {
    return crypt
        .createHash('md5')
        .update(str, 'utf8')
        .digest('hex')
}


//----------- Calculate the store checksum
function checksumCalculation() {
    appStruct.status.checksum = getHash(JSON.stringify(appStruct.store));
}


//----------- Sync store
function syncStore(hosts) {

    log('NFO','Updating store from an existing host...');

    var addresses = [];
    var asyncTasks = [];

    for(var host in hosts) { addresses.push(hosts[host].address); }

    asyncTasks.push(function(callback) { callback(null, false); });

    addresses.forEach(function(addr) {

        asyncTasks.push(function(arg, callback) {           
            
            if(arg == true) { 

                callback(null, true); 

            } else {
                    
                if(addr != ip.address() && appStruct.config.blacklist.indexOf(addr) == -1) {

                    recl.get("https://" + addr + ":8000/api/status/checksum", function(data1,res) {

                        var rc = data1.toString('utf8');

                        if(appStruct.status.checksum != rc) {

                            recl.get("https://" + addr + ":8000/api/store", function(data2,res) {

                                var buffer = data2;
                                var lc = getHash(JSON.stringify(buffer));
                                
                                if(lc == rc) {

                                    appStruct.store = data2;
                                    appStruct.status.checksum = lc;

                                    log('NFO','The store is updated from ' + addr + '.');

                                    writeStore();

                                    if(appStruct.status.isolated == true) {
                                        updateRemoteBlacklist('DEL', ip.address());
                                        appStruct.status.isolated = false;
                                    }

                                    buffer = null;
                                    lc = null;

                                    callback(null, true);

                                } else {

                                    log('ERR','Checksum error, the store can\'t be updated.');

                                    updateRemoteBlacklist('ADD',ip.address());
                                    appStruct.status.isolated = true;

                                    log('ERR','This instance is now isolated from cluster.');
                                    log('WAR', 'Try to force to resync the store if other attempts have failed.');

                                    buffer = null;
                                    lc = null;

                                    callback(null, false);
                                }
                            
                            }).on('error', function(err) {
                                log('WAR', addr + ' is not ready to give access to data.');
                                callback(null, false);
                            });

                        } else {
                            log('NFO','The store is already up to date.');
                            callback(null, true);
                        }

                    }).on('error', function(err) { 
                        log('ERR', addr + ' is unreachable. Can\'t get checksum and update store.');
                        callback(null, false); 
                    });

                } else {
                    callback(null, false);
                };

            }

        });

    });

    asyn.waterfall(asyncTasks, function(err,result) {
        if(result == true) {
            log('NFO','Synchronization successful.');
        } else {
            log('ERR','Synchronization failed.');
        }
    });

}


//----------- Write store
function writeStore() {
    fs.writeFile('store.json', JSON.stringify(appStruct.store, null, 4), (err) => {
        if (err) {
            log('ERR','Can\'t write to store.json file.');
        } else {
            log('NFO','Store saved to store.json file.');
        }
    });
}


//----------- Load store
function loadStore() {
    fs.readFile('store.json', (err, data) => {
        if (err) {
            log('WAR','Can\'t load store.json file (First run?).');
        } else {
            appStruct.store = JSON.parse(data);
            appStruct.status.checksum = getHash(JSON.stringify(appStruct.store));
            log('NFO','Store loaded from store.json file.');
        }
    }); 
}


//----------- Load credentials
function loadCredentials() {
    try {
        appStruct.credentials = JSON.parse(fs.readFileSync('credentials.json','utf8'));
        log('NFO','Credentials loaded from credentials.json file.');
    } catch(e) {
        log('ERR','Can\'t load credentials.json file, default credentials will be used.');
    }
}


//----------- Refresh members
function refreshMembers() {
    
    var tmp = htds.hosts();
    appStruct.config.members = [];
    
    for(var entry in tmp) {
        appStruct.config.members.push(tmp[entry]);
    }
    
}


//----------- Add member to blacklist (when checksum error)
function addToBlacklist(address) {
    appStruct.config.blacklist.push(address);
    log('WAR', address + ' is now isolated from cluster.');
}


//----------- Remove member from blacklist
function rmFromBlacklist(address) {
    appStruct.config.blacklist.splice(appStruct.config.blacklist.indexOf(address),1);
    log('NFO', address + ' is back in the cluster.');
}


//----------- Update remote blacklist
function updateRemoteBlacklist(method,address) {

    var tmp = htds.hosts();
    var uri = null;

    for(var entry in tmp) {

        if(entry != ip.address()) {

            switch(method) {
                case 'ADD' :
                    uri  = 'https://' + entry + ':8000' + '/api/config/blacklist/add/' + address;
                    break;
                case 'DEL' :
                    uri  = 'https://' + entry + ':8000' + '/api/config/blacklist/del/' + address;
                    break;
            }

            recl.post(uri, args, function(data,res) {}).on('error', function(err) { 
                log('ERR', "Can\'t update remote blacklist (" + entry + "). You should stop this instance!"); 
            });

        }

    }

}


//----------- Log
function log(type,msg) {
    
    if(appStruct.log.length > 20) {
        appStruct.log.splice(0,1);
    }
    
    appStruct.log.push({date:Date.now(),type:type,msg:msg});
    
}


//----------- Test & returns JSON
function IsJsonString(str) {
    
    var json = null;
    
    try {
        json = JSON.parse(str);
    } catch (e) {
    }
    
    return json;
}


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


//----------- POST

// Create node
appl.post('/api/store/:node', auth, function(req,res) {
    try {
        if(appStruct.store.hasOwnProperty(req.params.node)) {
            res.sendStatus(409);
        } else {
            if(typeof req.params.node == 'string') {
                treatUpdate(req.params,req.body,req.path,'POST');
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
                    treatUpdate(req.params,req.body,req.path,'POST');
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


// Add member to blacklist
appl.post('/api/config/blacklist/add/:addr', auth, function(req,res) {
    try {
        addToBlacklist(req.params.addr);
        res.sendStatus(200);
    } catch(e) {
        res.sendStatus(404);
    }
});


// Remove member from blacklist
appl.post('/api/config/blacklist/del/:addr', auth, function(req,res) {
    try {
        rmFromBlacklist(req.params.addr);
        res.sendStatus(200);
    } catch(e) {
        res.sendStatus(404);
    }
});


//----------- DELETE

// Delete node
appl.delete('/api/store/:node', auth, function(req,res) {
    try {
        if(appStruct.store.hasOwnProperty(req.params.node)) {
            treatUpdate(req.params,req.body,req.path,'DELETE');
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
            treatUpdate(req.params,req.body,req.path,'DELETE');
            res.sendStatus(200);
        } else {
            res.sendStatus(404);
        }
    } catch(e) {
        res.sendStatus(400);
    }
});


//----------- UPDATE

// Update key
appl.put('/api/store/:node/:key', auth, function(req,res) {
    if(appStruct.store.hasOwnProperty(req.params.node) && appStruct.store[req.params.node].hasOwnProperty([req.params.key])) {
        if(typeof req.body.value != 'object' && typeof req.body.value != 'function' && typeof req.body.value != 'symbol') {
            treatUpdate(req.params,req.body,req.path,'UPDATE')
            res.sendStatus(200);
        } else {
            res.sendStatus(400);
        }
    } else {
        res.sendStatus(404);
    }
});


//----------- PATCH

// Synchronize store
appl.patch('/api/store/sync', auth, function(req,res) {
    syncStore(htds.hosts());
    res.sendStatus(200);
});


//----------------------------------------- HOST DISCOVERY 

//----------- Events 
htds.on('join', (addr) => { refreshMembers(); });
htds.on('leave', (addr) => { 
    refreshMembers(); 
    if(appStruct.config.blacklist.indexOf(addr) != -1) {
        rmFromBlacklist(addr);
    }
});


//----------------------------------------- PROCESS EVENTS
process.on('SIGTERM', function() {
    wsrv.close({});
    htds.stop();
    process.exit(0);
});


//----------------------------------------- GO!!
log('NFO','Starting...');
loadCredentials();
loadStore();


//----------- REST API CLIENT INSTANCE
var recl_options = {
    user: appStruct.credentials.user,
    password: appStruct.credentials.password,
    connection: {
        rejectUnauthorized: false
	}
}

var recl = new nrcl(recl_options);


//----------- STARTS DISCOVERY
try {
    htds.start();
    log('NFO','Host Discovery module is started.');
} catch(e) {
    log('ERR','Host Discovery module Discovery can\'t start.');
}


//----------- WAIT 6s FOR DISCOVERY TO RETRIEVES HOST LIST
setTimeout(function(){
    
    //----------- AFTER 6s, SYNC THE STORE FROM OTHER HOST
    syncStore(htds.hosts());
    
    //----------- EXPRESS LISTENING
    wsrv.listen(8000);
    
    log('NFO','API is listening on ' + ip.address() + ':8000');
    
}, 6000);