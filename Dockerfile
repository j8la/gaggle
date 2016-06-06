FROM node:5.11.1

MAINTAINER Julien Blanc <jbla@tuta.io>

EXPOSE 2900/udp 8000

WORKDIR /gaggle

COPY package.json /gaggle/
COPY gaggle.js /gaggle/
COPY cert.pem /gaggle/
COPY key.pem /gaggle/
COPY LICENSE /gaggle/

RUN npm install argparse \
&& npm install body-parser \
&& npm install express \
&& npm install host-discovery \
&& npm install ip \
&& npm install node-rest-client

ENTRYPOINT ["node", "gaggle.js", "-c"]
CMD ["gaggle"] 