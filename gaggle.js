/*
Name    : gaggle.js
Author  : Julien Blanc
Version : 1.0.0
Date    : 19/05/2016
NodeJS  : 6.1+
*/


//----------------------------------------- LOAD MODULES

//------ External modules
var expr    = require('express');
var bdyp    = require('body-parser');
var hstd    = require('host-discovery');
var argp    = require('argparse').ArgumentParser;
var nrcl    = require('node-rest-client').Client;


//------ Node modules
var fs      = require('fs');
var ip      = require('ip');
var os      = require('os');


//----------------------------------------- EXPRESS CONFIG
var appl = expr();                       

appl.use(bdyp.json());
appl.use(bdyp.urlencoded({ extended: true }));


//----------------------------------------- ARGUMENTS
var parser = new argp({
    version: '1.0.0',
    addHelp: true,
    description: 'Gaggle cluster'
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
    status: {
        sdate: Date.now(),
        suptime: null,
        hostname: os.hostname(),
        system: os.type(),
        version: os.release(),
        arch: os.arch(),
        ouptime: null
    },
    config: {
        clusterId: args.cluster,
        members: []
    },
    log: [],
    store: {}
}


//----------------------------------------- HOST DISCOVERY
var htds    = new hstd({
    service: appStruct.config.clusterId,    // Default to 'all' 
    protocol: 'udp4',                       // Default to udp4, can be udp6 
    port: 2900                              // Default to 2900 
});


//----------------------------------------- REST API CLIENT INSTANCE
var recl    = new nrcl();                   // Rest API client


//----------------------------------------- REST API

//----------- GET
appl.get('/api/status', function(req,res) {
    appStruct.status.suptime = Math.round((Date.now() - appStruct.status.sdate)/1000);
    appStruct.status.ouptime = os.uptime();
    res.send(appStruct.status);
});

appl.get('/api/config', function(req,res) {
    res.send(appStruct.config);
});

appl.get('/api/log', function(req,res) {
    res.send(appStruct.log);
});

appl.get('/api/config/members', function(req,res) {
    res.send(appStruct.config.members);
});

appl.get('/api/store', function(req,res) {
    res.send(appStruct.store);
});

appl.get('/api/store/:node', function(req,res) {
    if(appStruct.store.hasOwnProperty(req.params.node)) {
        res.send(appStruct.store[req.params.node]);
    } else {
        res.sendStatus(404);
    }
});

appl.get('/api/store/:node/:key', function(req,res) {
    if(appStruct.store.hasOwnProperty(req.params.node) && appStruct.store[req.params.node].hasOwnProperty(req.params.key)) {
        res.send(appStruct.store[req.params.node][req.params.key]);
    } else {
        res.sendStatus(404);
    }
});


//----------- Function refresh store
function refreshStore() {
    for(var x in appStruct.config.members) {
        if(appStruct.config.members[x].address != ip.address()) {
            var args = {
                data: { address: ip.address() },
                headers: { "Content-Type": "application/json" }
            }
            recl.post('http://' + appStruct.config.members[x].address + ':8000/api/store/refresh', args, function(data,res) {
                //log('NFO', 'A notification has been sent to ' + appStruct.config.members[x].address + '.');
            }).on('error', function(err) { 
                log('ERR', appStruct.config.members[x].address + ' is unreachable. The updating of the remote host failed.'); 
            });
        }
    }
}


//----------- POST

// Refresh
appl.post('/api/store/refresh', function(req,res) {
    recl.get("http://" + req.body.address + ":8000/api/store", function(data,res) {
        appStruct.store = data;
        log('NFO','The store has been updated from ' + req.body.address + '.');
        writeStore();
    }).on('error', function(err) { 
        log('ERR','An update has been detected from ' + req.body.address + ' but the store has not been updated.'); 
    });
    res.sendStatus(200);
});

// Create node
appl.post('/api/store/:node', function(req,res) {
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
appl.post('/api/store/:node/:key', function(req,res) {
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
appl.delete('/api/store/:node', function(req,res) {
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
appl.delete('/api/store/:node/:key', function(req,res) {
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
appl.put('/api/store/:node/:key', function(req,res) {
    if(appStruct.store.hasOwnProperty(req.params.node) && appStruct.store[req.params.node].hasOwnProperty([req.params.key])) {
        if(typeof req.body.value != 'object' && typeof req.body.value != 'function' && typeof req.body.value != 'symbol') {
            appStruct.store[req.params.node][req.params.key] = req.body.value;
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
            log('NFO','Store loaded from store.json file.');
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


//----------------------------------------- GO!!
log('NFO','Starting...');
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
                recl.get("http://" + entry + ":8000/api/store", function(data,res) {
                    try {
                        appStruct.store = data;
                        log('NFO','The store is updated from ' + entry + '.');
                        writeStore();
                        isUpdated = true;
                    } catch(e) {
                        log('ERR','The store can\'t be updated.');
                    }
                }).on('error', function(err) {
                    log('WAR', entry + ' is starting at the same time.');
                })
            }
        } 
    }
    
    
    //----------- EXPRESS LISTENING
    appl.listen(8000, function() {});
    log('NFO','API is listening on ' + ip.address() + ':8000');
    
}, 6000);