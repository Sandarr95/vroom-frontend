'use strict';

var exportControl = L.Control.extend({
  options: {
    position: 'topleft'
  },

  onAdd: function (map) {
    // Add reference to map.
    map.exportControl = this;
    this._div = L.DomUtil.create('div', 'custom-control icon-control export-control');
    this._div.title = 'Export';

    this._div.onclick = function(e) {
      L.DomEvent.stopPropagation(e);
      map.fireEvent('export');
    };
    return this._div;
  },

  onRemove: function (map) {
    // Remove reference from map.
    delete map.exportControl;
  }
});

var exportControl = new exportControl();

module.exports = exportControl;
