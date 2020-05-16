'use strict';

module.exports = {
  tileLayer: 'http://{s}.tile.osm.org/{z}/{x}/{y}.png',
  host: window.location.origin + '/vroom/',
  maxJobNumber: 1000,
  overpassEndpoint: 'https://overpass-api.de/api/interpreter'
};
