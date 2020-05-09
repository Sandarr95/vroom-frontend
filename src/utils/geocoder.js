'use strict';

require('leaflet-control-geocoder');

var defaultGeocoder = L.Control.Geocoder.nominatim({
  serviceUrl: window.location.origin + '/nominatim/'
});

var control = L.Control.geocoder({
  geocoder: defaultGeocoder,
  collapsed: true,
  position: 'topleft'
});

module.exports = {
  defaultGeocoder: defaultGeocoder,
  control: control
};
