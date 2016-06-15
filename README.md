Gaggle
=====

## Menu
- [Introduction](#introduction)
- [Network](#network)
- [Store](#store)
- [Request and update the store](#request-and-update-the-store)

=====

### [Introduction](#introduction)
Gaggle is a Node JS application that aims to maintain a distributed configuration store on the network and is specially designed to working in Docker containers. Gaggle finds each instance on the network with multicast discovery system and builds a list, the cluster, that will be used to update or replicate the store. 

Gaggle provides, on each instance, a REST API to update the store, serve datas, check the status, get members ... Apart from multicast discovery, communication between each instance is realized through the REST API.

The REST API is provided over HTTPS only and has a HTTP basic authentication.

![Gaggle Structure](https://kxtmuq-bn1306.files.1drv.com/y3mYtAfmQ3YAtFQz3QqK-_GYAeRmSzhOoJx1Rm1V8PzN1p8k9nzykA619_Vi-dz-z0mrfY-5n09t77l1WykcKxtHrIvpFck87cgV6u7qx6As-RLdhD-REXrQmJLOwatS1S2R2Pu6F5SHc3GMua5C1B_Gg?width=500&height=376&cropmode=none)

### [Network](#network)
The 2900/UDP port is used for discovery and 8000/TCP port is used for REST API communication between instances and for client requests.

Multicast and Docker are problematic for now, so only one Gaggle instance must be used by host with the **--net=host** option when starting container. This can evolve in the future with next Docker releases (i really hope). The ultimate goal would be to use Gaggle with the network overlay driver.

Good news, Gaggle Docker container and multicast are working perfectly with [Weave Net](https://www.weave.works/products/weave-net/). In this case, you must use **--net=weave**. This configuration is described in the wiki documentation. 

### [Store](#store)
The store is structured, for now, as follows :

![Gaggle Structure](https://zuvdyw-bn1306.files.1drv.com/y3mJ3m7DvU3oGnDDmn0jDwJLgr2XDp8-_h2H8hV3VjeT4ASfmhra9nUjVQHIoz91T97v3ukvjnpSDaqWttCPe4UNOD5czlDf-3mII0Plfyhrkh-Gm7ePgkzJ2Cl__g_EBSxiziU9YxjpkA2cQUHP4lb7Q?width=125&height=120&cropmode=none)

At each start, Gaggle loads its own store copy from a file and if another instance is found, updates it. The store datas are not read from file but from memory, the file is only used as backup.

The store.json file is located in the folder where is executed Gaggle. If it does not exist, it is automatically created.

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

A key can contain a JSON structure but you must escape special characters before insert. In this case, you have to manage the JSON structure in a key by yourself. Gaggle keeps control only at first level, you can't modify, for example, a sub node or a sub key via the Gaggle REST API.

### [Request and update the store](#request-and-update-the-store)
Since 0.7.x version, you can read and write on each Gaggle instance. This became possible since an instance replicates only an object and no more entirely the store. 
For now, a scenario with numerous concurrent writes on several instances has not been tested and other improvements can still be made. You can still use a single point to manage the connection redundancy to the store with the list of members returned through the REST API.

![Gaggle example](https://bjuucq-bn1306.files.1drv.com/y3mxcYE7TdUCp6s-Sb1nnnbgzkf8gJgPmP2j3A341m3pIDlfKJnfzvwKMv2qlKTQGkVsnGnmMh2JNmqxIhClSjYBh3jJzg2TyUyQjIDuwNh1WZBEFD21Wo1NS18zla8ZRGnRzVwfavXxH5wYs8gXt1wgQ?width=500&height=376&cropmode=none)

The development is quite young and improvements are planned. A graphical client prototype will be available soon on another repository.

[Check the documentation for more informations.](https://github.com/j8la/gaggle/wiki)

=====

Copyright (c) 2016 by Julien Blanc

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program. If not, see http://www.gnu.org/licenses/
