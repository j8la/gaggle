/*
Name    : manada.js
Author  : Julien Blanc
Version : 0.9.0
Date    : 02/07/2016
NodeJS  : 6.2.2
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
var hstd    = require('host-discovery');
var argp    = require('argparse').ArgumentParser;
var nrcl    = require('node-rest-client').Client;
var baut    = require('basic-auth');
var asyn    = require('async');
var helm    = require('helmet');
var ip      = require('ip');

//------ Node modules
var fs      = require('fs');
var os      = require('os');
var crypt   = require('crypto');
var https   = require('https');


//----------------------------------------- EXPRESS CONFIG
var appl = expr();

//----------- Security
appl.use(helm());                       

//----------- Body parser
appl.use( function (req, res, next) {  

    if(req.method === 'POST' || req.method === 'PUT') {

        if (req.headers['content-type'].toLowerCase() === 'application/json') {

            if (!parseInt(req.headers['content-length'])) {
                req.body = {};
                next();
            } else {
                req.on('data', function (data) {
                    try {
                        req.body = JSON.parse(data.toString());
                        next();
                    } catch (e) {
                        req.body = {};
                        next();
                    }
                });
            }

        } else {
            next();
        }

    } else {
        next();
    }

 });


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
    version: '0.9.0',
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
        help: 'Disable replication when push datas. Only for testing.',
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

//----------- Checksum
function getHash(str) {
    return crypt
        .createHash('md5')
        .update(str, 'utf8')
        .digest('hex');
}

//----------- Calculate the store checksum
function checksumCalculation() {
    appStruct.status.checksum = getHash(JSON.stringify(appStruct.store));
}

//----------- Compare checksum
function checksumCompare(from, extChecksum, method) {
    if(extChecksum != appStruct.status.checksum) {
        log('ERR','Checksum error, the update from ' + from + 'has failed (' + method + ').');
        updateRemoteBlacklist('ADD',ip.address());
        appStruct.status.isolated = true;
        log('ERR', 'This instance is now isolated from cluster.');
        log('NFO', 'Try to resync the store.');
    } else {
        appStruct.status.isolated = false;
        log('NFO', from + ' has pushed an update (' + method + ') with success.');
    }
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

                    recl.get("https://" + addr + ":8000/api/v2/status/checksum", function(data1,res) {

                        var rc = data1.toString('utf8');

                        if(appStruct.status.checksum != rc) {

                            recl.get("https://" + addr + ":8000/api/v2/store", function(data2,res) {

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
        if(appStruct.status.checksum != "0") {
            if(result == true) {
                log('NFO','Synchronization successful.');
            } else {
                if(addresses.length > 1) {
                    log('ERR','Synchronization failed.');
                } else {
                    log('NFO','Nothing to synchronize. First on network.');
                }
            }
        } else {
            log('NFO','Nothing to synchronize. The store is empty because it is the first start.');
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
            log('WAR','Can\'t load store.json file (First start?).');
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
function updateRemoteBlacklist(method, address) {

    var tmp = htds.hosts();
    var uri = null;

    for(var entry in tmp) {

        if(entry != ip.address()) {

            switch(method) {
                case 'ADD' :
                    uri  = 'https://' + entry + ':8000' + '/api/v2/config/blacklist/add/' + address;
                    break;
                case 'DEL' :
                    uri  = 'https://' + entry + ':8000' + '/api/v2/config/blacklist/del/' + address;
                    break;
            }

            recl.post(uri, args, function(data,res) {}).on('error', function(err) { 
                log('ERR', "Can\'t update remote blacklist (" + entry + "). You should stop this instance!"); 
            });

        }

    }

}

//----------- Log
function log(type, msg) {
    
    if(appStruct.log.length > 20) {
        appStruct.log.splice(0,1);
    }
    
    appStruct.log.push({date:Date.now(),type:type,msg:msg});
    
}

//----------- Update hosts
function updateHosts(refCfg, path, body, method) {

    var args = {
        data: body,
        headers: { "Content-Type": "application/json" }
    }

    for(var x in refCfg.members) {

        if(refCfg.members[x].address != ip.address()) {

            if(refCfg.blacklist.indexOf(refCfg.members[x].address) == -1) {

                if(norepl == false) {

                    var errMsg  = refCfg.members[x].address + ' is unreachable. The updating of the remote host failed.';
                    var baseUri = 'https://' + refCfg.members[x].address + ':8000/api/v2/store';

                    switch(method) {

                        case 'POST' :
                            recl.post(baseUri + '?from=' + ip.address() + '&checksum=' + appStruct.status.checksum, args, function(data,res) {
                            }).on('error', function(err) { 
                                log('ERR', errMsg); 
                            });
                            break;

                        case 'DELETE' :
                            recl.delete(baseUri + '/' + path + '?from=' + ip.address() + '&checksum=' + appStruct.status.checksum, function(data,res) {
                            }).on('error', function(err) { 
                                log('ERR', errMsg); 
                            });
                            break;

                        case 'UPDATE' :
                            recl.put(baseUri + '?from=' + ip.address() + '&checksum=' + appStruct.status.checksum, args, function(data,res) {
                            }).on('error', function(err) { 
                                log('ERR', errMsg); 
                            });
                            break;

                    }

                }

            }

        }

    }

}

//----------- Test if valid string
function isValidString(str) {
    return !/[^\w\s]/gi.test(str);
}

//----------- Permit value 
function permitVal(val) {
    if(typeof val !== 'function' && 
       typeof val !== 'symbol' &&
       typeof val !== 'undefined' &&
       val !== null) {
        return val;
    } else {
        return null;
    }
}

//----------- Recursive function from hell to manage object structure from a path. Broken head.
function index(refObj, path, value) {

    if(refObj !== undefined && refObj !== null) {
        
        if (typeof path == 'string') {

            if(path.charAt(0) != '/') { path = '/' + path; }
            if(path.slice(-1) == '/') { path = path.slice(0,-1); }

            path = path.replace('/','').split('/');

            if(path.length == 1 && path[0] === '' && value !== undefined && value !== null) {
                if(Object.prototype.toString.call(value) == '[object Object]' && Object.keys(value).length > 0) {
                    return refObj[Object.keys(value)[0]] = value[Object.keys(value)[0]];
                } else {
                    return { statusCode:400 };
                } 

            } else if(path.length == 1 && path[0] === '') {
                return refObj;

            } else {
                return index(refObj, path, value);
            }

        } else if(path.length == 1 && refObj.hasOwnProperty(path[0]) && value !== undefined && value !== null) {
            if(Object.prototype.toString.call(value) == '[object Object]' && Object.keys(value).length > 0) {
                if(Object.prototype.toString.call(refObj[path[0]]) != '[object Object]' && 
                   Object.prototype.toString.call(value[Object.keys(value)[0]]) == '[object Array]') {
                    refObj[path[0]] = {};
                } 
                return refObj[path[0]][Object.keys(value)[0]] = value[Object.keys(value)[0]];
                
            } else {
                return refObj[path[0]] = value;
            } 

        } else if(path.length > 0) {
            if(refObj.hasOwnProperty(path[0])) {
                return index(refObj[path[0]], path.slice(1), value);
            } else {
                return { statusCode:404 };
            }
        
        } else if(path.length === 0) {
            return refObj;

        } else {
            return { statusCode:400 };
        }

    } else {
        return { statusCode:400 };
    }

}

//----------- Recursive function from hell to delete an object members from a given path.
function delIndex(refObj, path) {

    if (typeof path == 'string') {

        if(path.charAt(0) != '/') { path = '/' + path; }
        if(path.slice(-1) == '/') { path = path.slice(0,-1); }

        path = path.replace('/','').split('/');

        if(path.length == 1 && path[0] === '') {
            return { statusCode:400 };
        } else {
            return delIndex(refObj, path);
        }
    
    } else if(path.length == 2 && Object.prototype.toString.call(refObj[path[0]]) == '[object Array]') {
        refObj[path[0]].splice(path[1],1);
        return { statusCode:200 };

    } else if(path.length > 1) {
        if(refObj.hasOwnProperty(path[0])) {
            return delIndex(refObj[path[0]], path.slice(1));
        } else {
            return { statusCode:404 };
        }

    } else if(path.length == 1) {
        if(Object.prototype.toString.call(refObj[path[0]]) == '[object Array]') {
    	    refObj[path[0]] = {};
        } 
        delete refObj[path[0]];
        return { statusCode:200 };

    }

}

//----------- Search in JSON
function search(refObj, key, parent="") {

    var result = [];

    for (var i in refObj) {
        
        if (Object.prototype.toString.call(refObj[i]) == '[object Object]') {
            result = result.concat(search(refObj[i], key, i));
        } else if(i == key) {
            result.push({
                parent: parent,
                key:i,
                value: refObj[i]
            });
        }

    }

    return result;
}


//----------------------------------------- REST API v2

//----------- GET

// Get status
appl.get('/api/v2/status', auth, function(req,res) {
    appStruct.status.suptime = Math.round((Date.now() - appStruct.status.sdate)/1000);
    appStruct.status.ouptime = os.uptime();
    res.send(appStruct.status);
});

// Get store checksum
appl.get('/api/v2/status/checksum', auth, function(req,res) {
    res.send(appStruct.status.checksum);
});

// Get instance config
appl.get('/api/v2/config', auth, function(req,res) {
    res.send(appStruct.config);
});

// Get logs
appl.get('/api/v2/log', auth, function(req,res) {
    res.send(appStruct.log);
});

// Get members of cluster
appl.get('/api/v2/config/members', auth, function(req,res) {
    res.send(appStruct.config.members);
});

// Get blacklist of cluster
appl.get('/api/v2/config/blacklist', auth, function(req,res) {
    res.send(appStruct.config.blacklist);
});

// Get all the store
appl.get('/api/v2/store', auth, function(req,res) {
    res.send(appStruct.store);
});

// Get element of store by path
appl.get('/api/v2/store/*', auth, function(req,res) {

    var result  = index(appStruct.store, req.params[0]);
    result.statusCode ? res.sendStatus(result.statusCode) : res.send(result);
    delete result;

});

//Search by key
appl.get('/api/v2/search/:key', auth, function(req,res) {
    res.send(search(appStruct.store,req.params.key));
});

//----------- POST

// Add member to blacklist
appl.post('/api/v2/config/blacklist/add/:addr', auth, function(req,res) {
    try {
        addToBlacklist(req.params.addr);
        res.sendStatus(200);
    } catch(e) {
        res.sendStatus(404);
    }
});

// Remove member from blacklist
appl.post('/api/v2/config/blacklist/del/:addr', auth, function(req,res) {
    try {
        rmFromBlacklist(req.params.addr);
        res.sendStatus(200);
    } catch(e) {
        res.sendStatus(404);
    }
});

// Create a resource 
appl.post('/api/v2/store', auth, function(req,res) {

    var body        = req.body;
    var path        = permitVal(body.path);
    var node        = permitVal(body.node);
    var key         = permitVal(body.key);
    var value       = permitVal(body.value);

    // Create a node
    if(path !== null && node !== null && key === null && value === null && isValidString(node)) {
        if(index(appStruct.store, path)[node]) {
            var result = 409;
        } else {
            var result = index(appStruct.store, path, { [node]:{} }).statusCode;
        }

    // Create a key:value pair
    } else if(path !== null && node === null && key !== null && value !== null && isValidString(key)) {
        if(index(appStruct.store, path)[key]) {
            var result = 409;
        } else {
            var result = index(appStruct.store, path, { [key]:value }).statusCode;
        }

    // Bad request
    } else {
        var result = 400;
    }

    result ? (res.sendStatus(result)) : (
        res.sendStatus(201),
        checksumCalculation(),
        writeStore()
    );

    if(!req.query.from && !req.query.checksum && !result) {
        updateHosts(appStruct.config, path, body, 'POST');
        delete result;

    } else if(!result) {
        checksumCompare(req.query.from, req.query.checksum, 'POST');
        delete result;

    }

});


//----------- UPDATE

// Update value
appl.put('/api/v2/store', auth, function(req,res) {

    var body        = req.body;
    var path        = permitVal(body.path);
    var value       = permitVal(body.value);

    if(path != null && value != null) {

        result = index(appStruct.store, path, value).statusCode;
        result ? (res.sendStatus(result)) : (
            res.sendStatus(200),
            checksumCalculation(),
            writeStore()
        );

        if(!req.query.from && !req.query.checksum && !result) {
            updateHosts(appStruct.config, path, body, 'UPDATE');
        } else if(!result) {
            checksumCompare(req.query.from, req.query.checksum, 'UPDATE');
        }

        delete result;

    } else {
        res.sendStatus(400);
    }

});


//----------- DELETE

// Delete a resource
appl.delete('/api/v2/store/*', auth, function(req,res) {

    result = delIndex(appStruct.store, req.params[0]).statusCode;
    res.sendStatus(result);

    if(result == 200) {
        checksumCalculation();
        writeStore();
        if(!req.query.from && !req.query.checksum) {
            updateHosts(appStruct.config, req.params[0], null, 'DELETE');
        } else {
            checksumCompare(req.query.from, req.query.checksum, 'DELETE');
        }
    } 
    
    delete result;

});


//----------- PATCH

// Synchronize store
appl.patch('/api/v2/sync', auth, function(req,res) {
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