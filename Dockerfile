FROM node:5.11.1

MAINTAINER Julien Blanc <jbla@tuta.io>

EXPOSE 2900/udp 8000

WORKDIR /manada

COPY . /manada/

RUN npm install argparse \
&& npm install body-parser \
&& npm install express \
&& npm install host-discovery \
&& npm install ip \
&& npm install node-rest-client \
&& npm install basic-auth \
&& chmod 540 mpass

VOLUME /manada

ENTRYPOINT ["node", "manada.js", "-c"]
CMD ["manada"] 