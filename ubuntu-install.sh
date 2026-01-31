#!/bin/bash

# exit on any error
set -e

# install docker
curl -fsSL https://get.docker.com | sh
sudo apt install uidmap -y
dockerd-rootless-setuptool.sh install

# setup guacamole server
docker compose up -d

# install dependencies for backend
sudo apt install openjdk-21-jdk -y
sudo apt install maven -y

# get ip and prompt user
sudo apt install net-tools -y
clear
ifconfig
read -p "Please copy down the IP above. Press enter when you are ready to continue."

# compile & start the backend
cd backend
./start.sh
