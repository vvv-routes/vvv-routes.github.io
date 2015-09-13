#!/bin/sh

set -u
set -e

DIR=../bus_route_checker

(cd $DIR && git pull)
(cd $DIR && make cache-clean && make)

cp    $DIR/index.html .
cp    $DIR/routes.json .
cp -r $DIR/websrc .

git add --all
git commit -m "update $(date --iso-8601=seconds -u)"
git push
