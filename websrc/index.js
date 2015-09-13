/*
 * This file is part of the bus_route_checker project.
 *
 * Copyright (C) 2015 Jens Steinhauser <jens.steinhauser@gmail.com>
 *
 * This program is free software; you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation; either version 2 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program; if not, write to the Free Software
 * Foundation, Inc., 51 Franklin St, Fifth Floor, Boston, MA  02110-1301 USA
 */

'use strict';

var app = angular.module('public_transport_checker', ['ngSanitize']);

app.factory('MapService', function() {
  var svc = {};

  // this is not "the angular way" (but a working hack)
  svc.map = L.map('map');
  svc.map.setView([47.243611, 9.893889], 10);
  svc.map.attributionControl.setPrefix('');

  var osmurl = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
  var osm = L.tileLayer(osmurl, {
    attribution: 'Map Data \u00A9 <a href="http://openstreetmap.org" target="_blank">OpenStreetMap</a> contributors',
    maxZoom: 19
  });

  var osmbwurl = 'http://{s}.tiles.wmflabs.org/bw-mapnik/{z}/{x}/{y}.png';
  var osmbw = L.tileLayer(osmbwurl, {
    attribution: 'Map Data \u00A9 <a href="http://openstreetmap.org" target="_blank">OpenStreetMap</a> contributors',
    maxZoom: 19
  });

  var transporturl = 'https://{s}.tile.thunderforest.com/transport/{z}/{x}/{y}.png';
  var transport = L.tileLayer(transporturl, {
    attribution: 'Map Data \u00A9 <a href="http://openstreetmap.org" target="_blank">OpenStreetMap</a> contributors, ' +
                 'Tiles courtesy of <a href="http://www.thunderforest.com/" target="_blank">Andy Allan</a>',
    maxZoom: 19
  });

  var bmorthourl = 'http://maps{s}.wien.gv.at/basemap/bmaporthofoto30cm/normal/google3857/{z}/{y}/{x}.{format}';
  var bmortho = L.tileLayer(bmorthourl, {
    attribution: 'Map Data \u00A9 <a href="http://www.basemap.at" target="_blank">basemap.at</a>',
    maxZoom: 19,
    subdomains: ['', '1', '2', '3', '4'],
    format: 'jpeg',
    bounds: [[46.35877, 8.782379], [49.037872, 17.189532]]
  });

  osm.addTo(svc.map);
  L.control.layers({
    'OpenStreetMap Carto': osm,
    'OpenStreetMap Carto Black/White': osmbw,
    'Transport Style': transport,
    'BasemapAT Ortho': bmortho
  }).addTo(svc.map);

  // add an object to the map
  svc.addObject = function(obj) {
    obj.addTo(svc.map);
  };

  // remove an object from the map
  svc.removeObject = function(obj) {
    svc.map.removeLayer(obj);
  };

  svc.zoomToBound = function(bnd) {
    svc.map.fitBounds(bnd);
  };

  svc.focusOnPoint = function(c) {
    svc.map.setView(c);
  };

  return svc;
});

// returns 'true' if the route is in the blacklist, false otherwise
function RouteBlacklistCheck(rid) {
  if (!Modernizr.localstorage) {
    return false;
  }

  var s = 'blacklist.route.' + rid;
  return !(localStorage.getItem(s) === null);
};

// adds the route to the blacklist
function RouteBlacklistAdd(rid) {
  if (!Modernizr.localstorage) {
    return;
  }

  var s = 'blacklist.route.' + rid;
  localStorage.setItem(s, 1);
};

// removes the route from the blacklist
function RouteBlacklistRemove(rid) {
  if (!Modernizr.localstorage) {
    return;
  }

  var s = 'blacklist.route.' + rid;
  localStorage.removeItem(s);
};

app.factory('RoutesService', function ($http, MapService) {
  var svc = {};
  svc.route_masters = [];
  svc.platforms = {};
  svc.metadata = {};
  svc.polylines = {};
  svc.focusOnPoint = MapService.focusOnPoint;
  svc.zoomToBound = MapService.zoomToBound;

  // show a route and it's platforms
  svc.showRoute = function(route) {
    RouteBlacklistRemove(route.id);

    var line = svc.polylines[route.id];
    MapService.addObject(line);

    angular.forEach(route.platforms, function(platform_id) {
      var platform = svc.platforms[platform_id];
      platform.count += 1;
      if (platform.count == 1) {
        MapService.addObject(platform.marker);
      }
    });

    line.bringToFront();
  };

  // hide a route from the map, and it's platforms if they aren't needed
  // by other visible routes
  svc.hideRoute = function(route) {
    RouteBlacklistAdd(route.id);

    var line = svc.polylines[route.id];
    MapService.removeObject(line);

    angular.forEach(route.platforms, function(platform_id) {
      var platform = svc.platforms[platform_id];
      platform.count -= 1;
      if (platform.count == 0) {
        MapService.removeObject(platform.marker);
      }
    });
  };

  function addRoutes(data) {
    var bounds = [];

    svc.platforms = data.platforms;
    angular.forEach(svc.platforms, function(platform) {
      platform.count = 0;
      platform.marker = L.circleMarker(platform.position, {
        radius: 6,
        color: 'black',
        opacity: 0.5,
        fill: false
      });
      platform.marker.bindPopup(platform.name);
    });

    angular.forEach(data.route_masters, function(route_master, i) {
      angular.forEach(route_master.routes, function(route, j) {
        var color = 'blue';
        if (('colour' in route.tags) && (/^#[0-9A-F]{6}$/i.test(route.tags['colour']))) {
          color = route.tags['colour'];
        }

        var line = L.multiPolyline(route.polylines, {
          color: color,
          opacity: 1
        });

        // we don't need this any more, drop it to make 'angular.copy()' faster
        delete route.polylines;

        line.bindPopup('name' in route.tags ? route.tags['name'] : 'name missing');

        // is the route visible on the map?
        route.visible = !RouteBlacklistCheck(route.id);
        if (route.visible) {
          bounds.push(line.getBounds());
        }

        // save the line for later when we add it to the map
        svc.polylines[route.id] = line;

        // should the errors and the stops be shown?
        route.show_details = !!route.errors.length;
      });

      // expand the route master if it or a child has errors
      route_master.show_details =
        route_master.routes.map(function(r) {
          return r.show_details;
        }).reduce(function(prev, curr) {
          return prev || curr;
        }, !!route_master.errors.length);
    });

    if (bounds.length > 0) {
      var bnd = bounds.reduce(function(prev, curr) {
        return prev.extend(curr);
      });

      MapService.zoomToBound(bnd);
    }

    angular.copy(data.route_masters, svc.route_masters);
    angular.copy(data.metadata, svc.metadata);
  }

  // fetch routes on factory
  $http.get('routes.json', { dataType: 'json', mimeType: 'application/json' })
    .success(addRoutes)
    .error(function(data, status) {
      console.log('error fetching routes.json: %s %s', data, status);
    });

  return svc;
});

app.controller('SidebarCtrl', function ($scope, RoutesService) {
  $scope.routesSvc = RoutesService;

  function modifyVisibility(v) {
    angular.forEach($scope.routesSvc.route_masters, function(route_master, i) {
      angular.forEach(route_master.routes, function(route, j) {
        route.visible = v;
      });
    });
  };

  function modifyDetailVisibility(c) {
    angular.forEach($scope.routesSvc.route_masters, function(route_master, i) {
      route_master.show_details = c;
      angular.forEach(route_master.routes, function(route, j) {
        route.show_details = c;
      });
    });
  };

  $scope.showAll = function() { modifyVisibility(true); };
  $scope.hideAll = function() { modifyVisibility(false); };
  $scope.expandAll = function() { modifyDetailVisibility(true); };
  $scope.collapseAll = function() { modifyDetailVisibility(false); };
  $scope.toggleDetails = function(o) {
    o.show_details = !o.show_details;
  };
  $scope.getPlatformName = function(id) {
    return $scope.routesSvc.platforms[id].name;
  };
  $scope.focusPlatform = function(id) {
    var platform = $scope.routesSvc.platforms[id];
    if (platform.count) {
      platform.marker.openPopup();
    }
    $scope.routesSvc.focusOnPoint(platform.position);
  };
  $scope.focusRoute = function(route) {
    var line = $scope.routesSvc.polylines[route.id];
    $scope.routesSvc.zoomToBound(line.getBounds());
  };
});

app.controller('MapCtrl', function ($scope, RoutesService) {
  $scope.routesSvc = RoutesService;

  // watch if the whole tree is modified
  $scope.$watchCollection("routesSvc.route_masters", function(new_rm) {
    // add a watcher for each routes visibility
    angular.forEach(new_rm, function(route_master, i) {
      angular.forEach(route_master.routes, function(route, j) {
        $scope.$watch(function() { return route.visible; }, function(vnew, vold) {
          // console.log('watcher for ' + i + ' ' + j);
          if (vnew) {
            $scope.routesSvc.showRoute(route);
          } else {
            if (!(vnew === vold)) {
              $scope.routesSvc.hideRoute(route);
            }
          }
        });
      });
    });
  });
});
