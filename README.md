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

### [Network](#network)
The 2900/UDP port is used for discovery and 8000/TCP port is used for REST API communication between instances and for client requests.

Multicast and Docker are problematic for now, so only one Gaggle instance must be used by host with the **--net=host** option when starting container. This can evolve in the future with next Docker releases (i really hope). The ultimate goal would be to use Gaggle in a network overlay.

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
It is not recommended to push updates in the store simultaneously on all instances but to use basically a single point to manage the connection redundancy to the store with the list of members returned through the REST API. However, you can get datas from any instance at the same time.

![Gaggle example](https://mjdtpw-bn1306.files.1drv.com/y3mVuz7KRHmFWV2qwI7SliKCrODNjZRs6lMK8KxOPYda3ekyOkVIyRjAS2GIVLZlnaOXCVp7IYB0nFDzfApWEIgi1cbCPl85iLhRK427eR4qjRyEC5SAlcwKHIa1ZZx_e_NN8lw5GfGhxCNbahpmK4Dnw?width=660&height=262&cropmode=none)

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
