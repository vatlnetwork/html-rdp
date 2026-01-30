#!/bin/bash

# install docker
curl -fsSL https://get.docker.com | sh
sudo apt install uidmap
dockerd-rootless-setuptool.sh install

# setup guacamole server
docker compose up -d

# install dependencies for backend
sudo apt install openjdk-21-jdk
sudo apt install maven

# compile & start the backend
cd backend
./start.sh
