FROM node:5.11.1

MAINTAINER Julien Blanc

EXPOSE 2900/udp
EXPOSE 8000

ADD package.json /
ADD gaggle.js /

RUN npm install argparse \
&& npm install body-parser \
&& npm install express \
&& npm install host-discovery \
&& npm install ip \
&& npm install node-rest-client

ENTRYPOINT ["node", "gaggle.js", "-c"]
CMD ["gaggle"]