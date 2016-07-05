![Manada](http://files.gandi.ws/gandi76242/image/logo_full.png)
=====
[![GitHub release](https://img.shields.io/github/release/j8la/manada.svg)](https://github.com/j8la/manada) [![GitHub issues](https://img.shields.io/github/issues/j8la/manada.svg)](https://github.com/j8la/manada/issues) [![Docker Stars](https://img.shields.io/docker/pulls/jbla/manada.io.svg)](https://hub.docker.com/r/jbla/manada.io/) [![GitHub license](https://img.shields.io/badge/license-AGPL-red.svg)](https://raw.githubusercontent.com/j8la/manada/master/LICENSE)


### Introduction
Manada is a Node JS application that aims to maintain a distributed configuration store in JSON format, on the network, and is specially designed to working in Docker containers. Manada finds each instance on the network with multicast discovery system and builds a list, the cluster, that will be used to update or replicate the store.  

Manada provides, on each instance, a REST API to update the store, serve datas, check the status, get members ... Apart from multicast discovery, communication between each instance is realized through the REST API.

The REST API is provided over HTTPS only and has a HTTP basic authentication.

Please note that new Manada releases, since the 0.9.0, are not compatible with earlier versions because the changes are too significant : new REST API, different provisioning mode, no more limits with JSON structure... This remark is also valid for the web client.

![Manada scheme](http://resizer.gandi.ws/gandi76242/image/schema1b.png?w=500)

### Network
The 2900/UDP port is used for discovery and 8000/TCP port is used for REST API communication between instances and for client requests.

Multicast and Docker are problematic for now, so only one Manada instance must be used by host with the **--net=host** option when starting container. This can evolve in the future with next Docker releases (i really hope). The ultimate goal would be to use Manada with the network overlay driver.

Good news, Manada Docker container and multicast are working perfectly with [Weave Net](https://www.weave.works/products/weave-net/). In this case, you must use **--net=weave**. This configuration is described in the wiki documentation. 

![WeaveNet](http://resizer.gandi.ws/gandi76242/image/schema2b.png?w=500)

### Store
The store is a JSON structure on which you have full control via the REST API. The only limitations you have are the JSON limitations.

At each start, Manada loads its own store copy from a file and if another instance is found, updates it. The store datas are not read from file but from memory, the file is only used as backup.

The store.json file is located in the folder where is executed Manada. If it does not exist, it is automatically created.

### Request and update the store
Since 0.7.x version, you can read and write on each Manada instance. This became possible since an instance replicates only an object and no more entirely the store. 
For now, a scenario with numerous concurrent writes on several instances has not been tested and other improvements can still be made. You can still use a single point to manage the connection redundancy to the store with the list of members returned through the REST API.

![Manada example](http://resizer.gandi.ws/gandi76242/image/schema3b.png?w=500)

The development is quite young and improvements are planned. A graphical client prototype will be available soon on another repository.

[Check the documentation for more informations.](https://github.com/j8la/manada/wiki)

=====

Copyright (c) 2016 Manada by Julien Blanc

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
