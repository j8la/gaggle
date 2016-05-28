Gaggle
=============
Gaggle is a distributed configuration service that works with multicast discovery.

## How it works
Gaggle is a Node JS application that aims to maintain a distributed configuration store on the network. Gaggle finds each instance on the network with multicast discovery system and builds a list, the cluster, that will be used to update or replicate the store. The 2900 UDP port is used for discovery.

At each start, Gaggle loads its own store copy from a file and if another instance is found, updates it. The store datas are not read from file but from memory, the file is only used as backup.

Gaggle provides, on each instance, a REST API to update the store, serve datas, check the status, get members ... Apart from multicast discovery, communication between each instance is realized through the REST API.

The store is structured, for now, as follows :
```
Store
  |_ Node1
  |   |_ Key1 : String
  |   |_ Key2 : String
  |_ Node2
      |_ Key1 : String
```

The store is stored in the JSON store.json file located in the folder where is executed Gaggle. If it does not exist, it is automatically created.

The JSON file looks like this :
```json
{
    "Node1": {
        "key1": "My string value 1",
        "key2": "My string value 2"
    },
    "Node2": {
        "key1": "My another string value"
    }
}
```

It is not recommended to push updates in the store simultaneously on all instances but to use basically a single point to manage the connection redundancy to the store with the list of members returned through the REST API.

This will change in the future in order to give the possibility to create complex trees and support other types of values.The REST API will certainly evolve to reflect this change.

The development is quite young and improvements are planned. A graphical client prototype being developed in Powershell, will be available soon on another repository.

## Start Gaggle
### NodeJS 
To start Gaggle, nothing is more simple. For each deployed instance :
```
node gaggle-js -c [id]
```
Where "id" is the cluster id that will be used for discovery.

### Docker
To start Gaggle in Docker container :
```
docker run --name gaggle --net=host -d jbla/gaggle myid
```

"myid" is the cluster id that will be used for discovery. If it's not specified, the cluster id "gaggle" will be used :
```
docker run --name gaggle --net=host -d jbla/gaggle
```

Multicast and Docker are problematic for now, so only one Gaggle instance must be used by host with the **--net=host** option. This can evolve in the future with next Docker releases (i really hope). 

If you use Swarm clusters and want to identify the container by name in a better way :
```
docker run --name gaggle-$(hostname) --net=host -d jbla/gaggle myid
 
CONTAINER ID     IMAGE          COMMAND                  CREATED          STATUS          PORTS    NAMES
ec35a2fc22ee     jbla/gaggle    "node gaggle.js -c my"   7 seconds ago    Up 6 seconds             gaggle-my-hostname1
```

## REST API
The 8000 TCP port is used for communication. The examples are given with the Curl utility. You can run commands on any instance.

### Get status
```
curl -X GET http://[ip]:8000/api/status
```
`Response :`
```json
{
    "sdate":1464384359801,
    "suptime":1743,
    "hostname":"my-hostname1",
    "system":"Linux",
    "version":"3.16.0-4-amd64",
    "arch":"x64",
    "ouptime":613317
}
```
`Details`
- sdate: Starting date of the service
- suptime: Service uptime
- ouptime: OS uptime

### Get configuration :
```
curl -X GET http://[ip]:8000/api/config
```
`Response :`
```json
{
    "clusterId":"id",
    "members":[
        {
            "address":"192.168.0.1",
            "hostname":"my-hostname1",
            "timestamp":1464384359813
        },
        {
            "address":"192.168.0.2",
            "hostname":"my-hostname2",
            "timestamp":1464384361903
        }
    ]
}
```

### Get members :
```
curl -X GET http://[ip]:8000/api/config/members
```
`Response :`
```json
[
    {
        "address":"192.168.0.1",
        "hostname":"my-hostname1",
        "timestamp":1464384359813
    },
    {
        "address":"192.168.0.2",
        "hostname":"my-hostname2",
        "timestamp":1464384361903
    }
]
```

### Get logs :
```
curl -X GET http://[ip]:8000/api/log
```
`Response :`
```json
[
    { "date":1464384359803, "type":"NFO", "msg":"Starting..."},
    { "date":1464384359807, "type":"NFO", "msg":"Host Discovery module is started."},
    { "date":1464384359813, "type":"ERR", "msg":"Can't load store.json file."},
    { "date":1464384365814, "type":"NFO", "msg":"Updating store from an existing host..."},
    { "date":1464384365840, "type":"NFO", "msg":"API is listening on 192.168.0.1:8000"},
    { "date":1464384365858, "type":"NFO", "msg":"The store is updated from 192.168.0.2."},
    { "date":1464384365860, "type":"NFO", "msg":"Store saved to store.json file."}
]
```

### Get store :
```
curl -X GET http://[ip]:8000/api/store
```
`Response :`
```json
{
    "test": {
        "key1":"My string value 1",
        "key2":"My string value 2"
    },
    "test2": {
        "key1":"My another string value"
    }
}
```

### Get node :
```
curl -X GET http://[ip]:8000/api/store/[node1]
```
`Response :`
```json
{
    "key1":"My string value 1",
    "key2":"My string value 2"
}
```

### Get key :
```
curl -X GET http://[ip]:8000/api/store/[node1]/[key1]
```
`Response :`
```json
My string value 1
```

### Create node :
```
curl -X POST http://[ip]:8000/api/store/[node1]
```
`Response :`
- **201** : Created
- **400** : Bad Request
- **409** : Conflict

### Create key :
```
curl -X POST http://[ip]:8000/api/store/[node1]/[key1]
```
`Response :`
- **201** : Created
- **400** : Bad Request
- **404** : Not found
- **409** : Conflict

### Put a value in key :
```
curl -H "Content-Type: application/json" -X PUT -d '{"value":"My string value 1"}' http://[ip]:8000/api/store/[node1]/[key1]
```
`Response :`
- **200** : OK
- **400** : Bad Request
- **404** : Not found

### Delete a node :
```
curl -X DELETE -http://[ip]:8000/api/store/[node1]
```
`Response :`
- **200** : OK
- **400** : Bad Request
- **404** : Not found

### Delete a key :
```
curl -X DELETE -http://[ip]:8000/api/store/[node1]/[key1]
```
`Response :`
- **200** : OK
- **400** : Bad Request
- **404** : Not found