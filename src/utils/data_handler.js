'use strict';

var LSetup = require('../config/leaflet_setup');
var api = require('../config/api');

var polyUtil = require('@mapbox/polyline');
var data = require('../data');
var panelControl = require('../controls/panel');
var collapseControl = require('../controls/collapse');
var fitControl = require('../controls/fit');
var clearControl = require('../controls/clear');
var solveControl = require('../controls/solve');
var summaryControl = require('../controls/summary');

var routes = [];

var getJobs = function() {
  return data.jobs;
}

var getShipments = function() {
  return data.shipments;
}

var getVehicles = function() {
  return data.vehicles;
}

var getOverpassQuery = function() {
  var key = document.getElementById('key-cell').value;
  var value = document.getElementById('value-cell').value;
  var bounds = LSetup.map.getBounds();
  var query = '[out:json];node(' + bounds.getSouth() + ',' +
              bounds.getWest() + ',' + bounds.getNorth() + ','+
              bounds.getEast() + ')[' + key + '=' + value + '];out;'
  return query;
}

var getJobsSize = function() {
  return data.jobs.length;
}

var getShipmentSize = function() {
  return data.shipments.length;
}

var getNextJobId = function() {
  return data.maxJobId + 1;
}

var getNextVehicleId = function() {
  return data.maxVehicleId + 1;
}

var getVehiclesSize = function() {
  return data.vehicles.length;
}

var checkControls = function() {
  var hasJobs = getJobsSize() > 0;
  var hasShipments = getShipmentSize() > 0;
  var hasVehicles = getVehiclesSize() > 0;
  if (hasJobs || hasShipments || hasVehicles) {
    // Fit and clear controls as soon as we have a location.
    if (!LSetup.map.fitControl) {
      LSetup.map.addControl(fitControl);
    }
    if (!LSetup.map.clearControl) {
      LSetup.map.addControl(clearControl);
    }
  }
  if (!LSetup.map.solveControl) {
    // Solve control appears only when there's enough input to fire a
    // solving query.
    if (hasVehicles && (hasJobs || hasShipments)) {
      solveControl.addTo(LSetup.map);
    }
  } else {
    if (getJobsSize() === 0  && getShipmentSize() === 0) {
      LSetup.map.removeControl(solveControl);
    }
  }
  if (hasSolution()) {
    LSetup.map.removeControl(solveControl);
    LSetup.map.addControl(summaryControl);
  }
  panelControl.showOverpassButton();
}

var _pushToBounds = function(coords) {
  if (data.bounds) {
    data.bounds.extend([coords[1], coords[0]]);
  } else {
    data.bounds = L.latLngBounds([coords[1], coords[0]],
                                 [coords[1], coords[0]]);
  }
}

var _recomputeBounds = function() {
  // Problem bounds are extended upon additions but they need to be
  // recalculated when a deletion might reduce the bounds.
  delete data.bounds;

  for (var i = 0; i < data.vehicles.length; i++) {
    var start = data.vehicles[i].start;
    if (start) {
      _pushToBounds(start);
    }
    var end = data.vehicles[i].end;
    if (end) {
      _pushToBounds(end);
    }
  }

  for (var i = 0; i < data.jobs.length; i++) {
    var loc = data.jobs[i].location;
    _pushToBounds(loc);
  }
}

var fitView = function() {
  if (data.bounds) {
    LSetup.map.fitBounds(data.bounds, {
      paddingBottomRight: [panelControl.getWidth(), 0],
      paddingTopLeft: [50, 0],
    });
  }
}

var hasSolution = function() {
  return routes.length > 0;
}

// Used upon addition to distinguish between start/end or job
// addition.
var _firstPlace = true;

var isFirstPlace = function() {
  return _firstPlace;
}

var firstPlaceSet = function() {
  _firstPlace = false;
}

var _hasCapacity = true;

var hasCapacity = function() {
  return _hasCapacity;
}

var _clearSolution = function() {
  if (hasSolution()) {
    // Back to input mode.
    panelControl.clearSolutionDisplay();
    panelControl.showJobDisplay();

    for (var i = 0; i < routes.length; ++i) {
      LSetup.map.removeLayer(routes[i]);
    }
    for (var k in data.jobsMarkers) {
      data.jobsMarkers[k].setStyle({
        color: LSetup.jobColor,
        radius: LSetup.jobRadius,
      });
    }
    LSetup.map.removeControl(summaryControl);

    routes = [];

    // Remove query output for this solution.
    delete data.output;
  }
}

var clearData = function() {
  // Back to adding a start/end for next place.
  _firstPlace = true;
  _hasCapacity = true;
  data.maxJobId = 0;
  data.maxVehicleId = 0;

  // Clear all data and markers.
  for (var k in data.jobsMarkers) {
    LSetup.map.removeLayer(data.jobsMarkers[k]);
    delete data.jobsMarkers[k];
  }
  for (var k in data.vehiclesMarkers) {
    LSetup.map.removeLayer(data.vehiclesMarkers[k]);
    delete data.vehiclesMarkers[k];
  }

  // Init dataset.
  data.jobs = [];
  data.vehicles = [];
  data.jobsMarkers = {};
  data.vehiclesMarkers = {};

  // Reset bounds.
  delete data.bounds;

  _clearSolution();
}

var closeAllPopups = function() {
  for (var k in data.jobsMarkers) {
    data.jobsMarkers[k].closePopup();
  }
  for (var k in data.vehiclesMarkers) {
    data.vehiclesMarkers[k].closePopup();
  }
}

var _setStart = function(v) {
  var vTable = document.getElementById('panel-vehicles-' + v.id.toString());

  vTable.deleteRow(1);
  var row = vTable.insertRow(1);
  row.setAttribute('class', 'panel-table');
  var idCell = row.insertCell(0);

  var remove = function() {
    if (_removeStart(v)) {
      // Reset start row when removing is ok.
      vTable.deleteRow(1);
      vTable.insertRow(1);
      if (getJobsSize() === 0 && getVehiclesSize() === 0) {
        LSetup.map.removeControl(clearControl);
      }
      checkControls();
    }
  }
  idCell.setAttribute('class', 'delete-location');
  idCell.title = 'Click to delete';
  idCell.onclick = remove;

  // Required when parsing json files with no start description.
  if (!v.startDescription) {
    v.startDescription = 'Start';
  }

  var nameCell = row.insertCell(1);
  nameCell.title = 'Click to center the map';
  nameCell.setAttribute('class', 'vehicle-start');
  nameCell.appendChild(document.createTextNode(v.startDescription));
  nameCell.onclick = function() {
    showStart(v, true);
  };

  // Marker and popup.
  data.vehiclesMarkers[v.id.toString() + '_start']
    = L.circleMarker([v.start[1], v.start[0]],
                     {
                       radius: 8,
                       weight: 3,
                       fillOpacity: 0.4,
                       color: LSetup.startColor
                     })
    .addTo(LSetup.map);

  var popupDiv = document.createElement('div');
  var par = document.createElement('p');
  par.innerHTML = '<b>Vehicle ' + v.id.toString() + ': </b>' + v.startDescription;
  var deleteButton = document.createElement('button');
  deleteButton.innerHTML = 'Del';
  deleteButton.onclick = remove;
  popupDiv.appendChild(par);
  popupDiv.appendChild(deleteButton);

  data.vehiclesMarkers[v.id.toString() + '_start']
    .bindPopup(popupDiv)
    .openPopup();
}

var _setEnd = function(v) {
  var vTable = document.getElementById('panel-vehicles-' + v.id.toString());

  vTable.deleteRow(2);
  var row = vTable.insertRow(2);
  row.setAttribute('class', 'panel-table');
  var idCell = row.insertCell(0);

  var remove = function() {
    if (_removeEnd(v)) {
      // Reset end row when removing is ok.
      vTable.deleteRow(2);
      vTable.insertRow(2);
      if (getJobsSize() === 0 && getVehiclesSize() === 0) {
        LSetup.map.removeControl(clearControl);
      }
      checkControls();
    }
  }
  idCell.setAttribute('class', 'delete-location');
  idCell.title = 'Click to delete';
  idCell.onclick = remove;

  // Required when parsing json files with no end description.
  if (!v.endDescription) {
    v.endDescription = 'End';
  }

  var nameCell = row.insertCell(1);
  nameCell.title = 'Click to center the map';
  nameCell.setAttribute('class', 'vehicle-end');
  nameCell.appendChild(document.createTextNode(v.endDescription));
  nameCell.onclick = function() {
    showEnd(v, true);
  };

  // Marker and popup.
  data.vehiclesMarkers[v.id.toString() + '_end']
    = L.circleMarker([v.end[1], v.end[0]],
                     {
                       radius: 8,
                       weight: 3,
                       fillOpacity: 0.4,
                       color: LSetup.endColor
                     })
    .addTo(LSetup.map);

  var popupDiv = document.createElement('div');
  var par = document.createElement('p');
  par.innerHTML =  '<b>Vehicle ' + v.id.toString() + ': </b>' + v.endDescription;
  var deleteButton = document.createElement('button');
  deleteButton.innerHTML = 'Del';
  deleteButton.onclick = remove;
  popupDiv.appendChild(par);
  popupDiv.appendChild(deleteButton);

  data.vehiclesMarkers[v.id.toString() + '_end']
    .bindPopup(popupDiv)
    .openPopup();
}

var _deleteAmounts = function() {
  for (var v = 0; v < data.vehicles.length; v++) {
    delete data.vehicles[v].capacity;
  }
  for (var j = 0; j < data.jobs.length; j++) {
    delete data.jobs[j].delivery;
    delete data.jobs[j].pickup;
  }
  alert("All capacity constraints have been removed.")
}

var addVehicle = function(v) {
  _clearSolution();
  data.vehicles.push(v);

  data.maxVehicleId = Math.max(data.maxVehicleId, v.id);

  var tableId = 'panel-vehicles-' + v.id.toString();
  var vTable = document.getElementById(tableId);
  if (!vTable) {
    // Create new table for current vehicle.
    vTable = document.createElement('table');
    vTable.setAttribute('id', tableId);
    vTable.setAttribute('class', 'panel-vehicle');

    // Set title.
    var row = vTable.insertRow(0);

    var titleCell = row.insertCell(0);
    titleCell.setAttribute('colspan', 2);

    var titleName = document.createElement('span');
    titleName.setAttribute('class', 'vehicle-title');
    titleName.appendChild(document.createTextNode('Vehicle ' + v.id.toString()));

    var clone = document.createElement('span');
    clone.setAttribute('class', 'clone-vehicle');
    clone.appendChild(document.createTextNode('Clone >>'));
    clone.onclick = function() {
      var v_copy = JSON.parse(JSON.stringify(v));
      v_copy.id = getNextVehicleId();
      addVehicle(v_copy);
      checkControls();
    };

    titleCell.appendChild(titleName);
    titleCell.appendChild(clone);

    vTable.insertRow(1);
    vTable.insertRow(2);
    document.getElementById('panel-vehicles').appendChild(vTable);
  }

  if (v.start) {
    _pushToBounds(v.start);
    _setStart(v);
  }
  if (v.end) {
    _pushToBounds(v.end);
    _setEnd(v);
  }

  if (_hasCapacity && !('capacity' in v)) {
    _hasCapacity = false;
    if (getVehiclesSize() + getJobsSize() > 1) {
      _deleteAmounts();
    }
  }

  _updateAllJobPopups();
}

var _jobDisplay = function(j) {
  var panelList = document.getElementById('panel-jobs');

  var nb_rows = panelList.rows.length;
  var row = panelList.insertRow(nb_rows);
  row.setAttribute('id', 'job-' + j.id.toString());
  var idCell = row.insertCell(0);

  idCell.setAttribute('class', 'delete-location');
  idCell.title = 'Click to delete';
  idCell.onclick = function() {
    _removeJob(j);
  };

  // Required when parsing json files containing jobs with no
  // description.
  if (!j.description) {
    j.description = 'No description';
  }

  var nameCell = row.insertCell(1);
  nameCell.title = 'Click to center the map';
  nameCell.appendChild(document.createTextNode(j.description));
  nameCell.onclick = function() {
    _openJobPopup(j);
    centerJob(j);
  };

  _handleJobPopup(j);
  _openJobPopup(j);
}

var _shipmentDisplay = function(s) {
  var panelList = document.getElementById('panel-jobs');

  var nb_rows = panelList.rows.length;
  var row = panelList.insertRow(nb_rows);
  row.setAttribute('id', 'job-' + s.delivery.id.toString());
  var idCell = row.insertCell(0);

  idCell.setAttribute('class', 'delete-location');
  idCell.title = 'Click to delete';
  idCell.onclick = function() {
    _removeShipment(s);
  };

  // Required when parsing json files containing jobs with no
  // description.
  if (!s.description) {
    s.description = 'No description';
  }

  var nameCell = row.insertCell(1);
  nameCell.title = 'Click to center the map';
  nameCell.appendChild(document.createTextNode(s.description));
  nameCell.onclick = function() {
    _openShipmentPopup(s);
    centerShipment(s);
  };

  _handleShipmentPopup(s);
  _openShipmentPopup(s);
}

var _setAsStart = function(vRank, j) {
  var marker = data.vehicles[vRank].id.toString() + '_start';
  LSetup.map.removeLayer(data.vehiclesMarkers[marker]);
  delete data.vehiclesMarkers[marker];

  data.vehicles[vRank].start = j.location;
  data.vehicles[vRank].startDescription = j.description;
  _setStart(data.vehicles[vRank]);

  _removeJob(j);
};

var _setAsEnd = function(vRank, j) {
  var marker = data.vehicles[vRank].id.toString() + '_end';
  LSetup.map.removeLayer(data.vehiclesMarkers[marker]);
  delete data.vehiclesMarkers[marker];

  data.vehicles[vRank].end = j.location;
  data.vehicles[vRank].endDescription = j.description;
  _setEnd(data.vehicles[vRank]);

  _removeJob(j);
};

var _handleJobPopup = function(j) {
  var popupDiv = document.createElement('div');
  var par = document.createElement('p');
  par.innerHTML = j.description;
  var deleteButton = document.createElement('button');
  deleteButton.innerHTML = 'Del';
  deleteButton.onclick = function() {
    _removeJob(j);
  };

  var startSelect = document.createElement('select');
  var startHeadOption = document.createElement('option');
  startHeadOption.innerHTML = "Start";
  startHeadOption.selected = true;
  startHeadOption.disabled = true;
  startSelect.appendChild(startHeadOption);

  var endSelect = document.createElement('select');
  var endHeadOption = document.createElement('option');
  endHeadOption.innerHTML = "End";
  endHeadOption.selected = true;
  endHeadOption.disabled = true;
  endSelect.appendChild(endHeadOption);

  for (var v = 0; v < data.vehicles.length; v++) {
    var startOption = document.createElement('option');
    startOption.value = v;
    startOption.innerHTML = 'v. ' + data.vehicles[v].id.toString();
    startSelect.appendChild(startOption);

    var endOption = document.createElement('option');
    endOption.value = v;
    endOption.innerHTML = 'v. ' + data.vehicles[v].id.toString();
    endSelect.appendChild(endOption);
  }
  startSelect.onchange = function() {
    _setAsStart(startSelect.options[startSelect.selectedIndex].value, j);
  }
  endSelect.onchange = function() {
    _setAsEnd(endSelect.options[endSelect.selectedIndex].value, j);
  }

  var optionsDiv = document.createElement('div');
  optionsDiv.appendChild(startSelect);
  optionsDiv.appendChild(endSelect);
  optionsDiv.appendChild(deleteButton);

  var optionsTitle = document.createElement('div');
  optionsTitle.setAttribute('class', 'job-options');
  optionsTitle.innerHTML = 'Options >>';
  optionsTitle.onclick = function() {
    if (optionsDiv.style.display === 'none') {
      optionsDiv.style.display = 'flex';
    } else {
      optionsDiv.style.display = 'none';
    }
    _openJobPopup(j);
  }

  popupDiv.appendChild(par);
  popupDiv.appendChild(optionsTitle);
  popupDiv.appendChild(optionsDiv);
  optionsDiv.style.display = 'none';

  data.jobsMarkers[j.id.toString()].bindPopup(popupDiv);

  data.jobsMarkers[j.id.toString()].on('popupclose', function() {
    optionsDiv.style.display = 'none';
  });
}

var _handleShipmentPopup = function(s) {
  var popupDiv = document.createElement('div');
  var par = document.createElement('p');
  par.innerHTML = s.description;
  var deleteButton = document.createElement('button');
  deleteButton.innerHTML = 'Del';
  deleteButton.onclick = function() {
    _removeShipment(s);
  };

  var optionsDiv = document.createElement('div');
  optionsDiv.appendChild(deleteButton);

  var optionsTitle = document.createElement('div');
  optionsTitle.setAttribute('class', 'job-options');
  optionsTitle.innerHTML = 'Options >>';
  optionsTitle.onclick = function() {
    if (optionsDiv.style.display === 'none') {
      optionsDiv.style.display = 'flex';
    } else {
      optionsDiv.style.display = 'none';
    }
    _openShipmentPopup(s);
  }

  popupDiv.appendChild(par);
  popupDiv.appendChild(optionsTitle);
  popupDiv.appendChild(optionsDiv);
  optionsDiv.style.display = 'none';

  data.jobsMarkers[s.delivery.id.toString()].bindPopup(popupDiv);

  data.jobsMarkers[s.delivery.id.toString()].on('popupclose', function() {
    optionsDiv.style.display = 'none';
  });
}

var _openJobPopup = function(j) {
  data.jobsMarkers[j.id.toString()].openPopup();
}

var _openShipmentPopup = function(s) {
  data.jobsMarkers[s.delivery.id.toString()].openPopup();
}

var _updateAllJobPopups = function() {
  for (var i = 0; i < data.jobs.length; i++) {
    _handleJobPopup(data.jobs[i]);
  }
}

var centerJob = function(j) {
  LSetup.map.panTo(data.jobsMarkers[j.id.toString()].getLatLng());
}

var centerShipment = function(s) {
  LSetup.map.panTo(data.jobsMarkers[s.delivery.id.toString()].getLatLng());
}

var addJob = function(j) {
  if (getJobsSize() >= api.maxJobNumber) {
    alert('Number of jobs can\'t exceed ' + api.maxJobNumber + '.');
    return;
  }

  if (_hasCapacity && !('delivery' in j) && !('pickup' in j)) {
    _hasCapacity = false;
    if (getVehiclesSize() + getJobsSize() > 1) {
      _deleteAmounts();
    }
  }

  _clearSolution();
  _pushToBounds(j.location);

  data.maxJobId = Math.max(data.maxJobId, j.id);
  data.jobs.push(j);
  data.jobsMarkers[j.id.toString()]
    = L.circleMarker([j.location[1], j.location[0]],
                     {
                       radius: LSetup.jobRadius,
                       weight: 3,
                       fillOpacity: 0.4,
                       color: LSetup.jobColor
                     })
    .addTo(LSetup.map);

  // Handle display stuff.
  _jobDisplay(j);
}

var addShipment = function(s) {
  if (getShipmentSize() >= api.maxJobNumber) {
    alert('Number of jobs can\'t exceed ' + api.maxJobNumber + '.');
    return;
  }

  _clearSolution();
  _pushToBounds(s.pickup.location);
  _pushToBounds(s.delivery.location);

  data.shipments.push(s);
  data.jobsMarkers[s.pickup.id.toString()]
    = L.circleMarker([s.pickup.location[1], s.pickup.location[0]],
                     {
                       radius: LSetup.jobRadius,
                       weight: 3,
                       fillOpacity: 0.4,
                       color: LSetup.jobColor
                     })
    .addTo(LSetup.map);
    data.jobsMarkers[s.delivery.id.toString()]
      = L.circleMarker([s.delivery.location[1], s.delivery.location[0]],
                       {
                         radius: LSetup.jobRadius,
                         weight: 3,
                         fillOpacity: 0.4,
                         color: LSetup.jobColor
                       })
      .addTo(LSetup.map);

    _shipmentDisplay(s)
}

var _removeJob = function(j) {
  _clearSolution();
  LSetup.map.removeLayer(data.jobsMarkers[j.id.toString()]);
  delete data.jobsMarkers[j.id.toString()];
  for (var i = 0; i < data.jobs.length; i++) {
    if (data.jobs[i].id == j.id) {
      data.jobs.splice(i, 1);
      var jobRow = document.getElementById('job-' + j.id.toString());
      jobRow.parentNode.removeChild(jobRow);
      if (getJobsSize() === 0 && getVehiclesSize() === 0) {
        LSetup.map.removeControl(clearControl);
      }
      checkControls();
      break;
    }
  }
  _recomputeBounds();
}

var _removeStart = function(v) {
  var allowRemoval = (data.vehicles.length > 1) || v.end;
  if (allowRemoval) {
    _clearSolution();

    LSetup.map.removeLayer(data.vehiclesMarkers[v.id.toString() + '_start']);
    delete data.vehiclesMarkers[v.id.toString()];

    for (var i = 0; i < data.vehicles.length; i++) {
      if (data.vehicles[i].id == v.id) {
        delete data.vehicles[i].start;
        delete data.vehicles[i].startDescription;
        if (!v.end) {
          var vTable = document.getElementById('panel-vehicles-' + v.id.toString());
          vTable.parentNode.removeChild(vTable);
          data.vehicles.splice(i, 1);
          _updateAllJobPopups();
        }
        break;
      }
    }

    _recomputeBounds();
  } else {
    alert('Can\'t delete both start and end with a single vehicle.');
  }
  return allowRemoval;
}

var _removeEnd = function(v) {
  var allowRemoval = (data.vehicles.length > 1) || v.start;
  if (allowRemoval) {
    _clearSolution();

    LSetup.map.removeLayer(data.vehiclesMarkers[v.id.toString() + '_end']);
    delete data.vehiclesMarkers[v.id.toString()];

    for (var i = 0; i < data.vehicles.length; i++) {
      if (data.vehicles[i].id == v.id) {
        delete data.vehicles[i].end;
        delete data.vehicles[i].endDescription;
        if (!v.start) {
          var vTable = document.getElementById('panel-vehicles-' + v.id.toString());
          vTable.parentNode.removeChild(vTable);
          data.vehicles.splice(i, 1);
          _updateAllJobPopups();
        }
        break;
      }
    }

    _recomputeBounds();
  } else {
    alert('Can\'t delete both start and end with a single vehicle.');
  }
  return allowRemoval;
}

var showStart = function(v, center) {
  var k = v.id.toString() + '_start';
  data.vehiclesMarkers[k].openPopup();
  if (center) {
    LSetup.map.panTo(data.vehiclesMarkers[k].getLatLng());
  }
}

var showEnd = function(v, center) {
  var k = v.id.toString() + '_end';
  data.vehiclesMarkers[k].openPopup();
  if (center) {
    LSetup.map.panTo(data.vehiclesMarkers[k].getLatLng());
  }
}

var setOutput = function(output) {
  data.output = output;
}

var getOutput = function() {
  return data.output;
}

var markUnassigned = function(unassigned) {
  for (var i = 0; i < unassigned.length; ++i) {
    data.jobsMarkers[unassigned[i].id.toString()]
      .setStyle({
        color: LSetup.unassignedColor,
        radius: LSetup.unassignedRadius,
      });
  }
}

var addRoutes = function(resultRoutes) {

  for (var i = 0; i < resultRoutes.length; ++i) {
    var latlngs = polyUtil.decode(resultRoutes[i]['geometry']);

    var routeColor = LSetup.routeColors[i % LSetup.routeColors.length];

    var path = new L.Polyline(latlngs, {
      opacity: LSetup.opacity,
      weight: LSetup.weight,
      color: routeColor}).addTo(LSetup.map);
    path.bindPopup('Vehicle ' + resultRoutes[i].vehicle.toString());

    data.bounds.extend(latlngs);

    // Hide input job display.
    panelControl.hideJobDisplay();

    var solutionList = document.getElementById('panel-solution');

    // Add vehicle to solution display
    var nb_rows = solutionList.rows.length;
    var row = solutionList.insertRow(nb_rows);
    row.title = 'Click to center the map';

    var showRoute = function (r) {
      return function() {
        routes[r].openPopup()
        LSetup.map.fitBounds(routes[r].getBounds(), {
          paddingBottomRight: [panelControl.getWidth(), 0],
          paddingTopLeft: [50, 0],
        });
      }
    };

    row.onclick = showRoute(i);

    var vCell = row.insertCell(0);
    vCell.setAttribute('class', 'vehicle-title');
    vCell.setAttribute('colspan', 2);
    vCell.appendChild(document.createTextNode('Vehicle ' + resultRoutes[i].vehicle.toString()));

    var jobIdToRank = {}
    if(data.jobs) {
      for (var j = 0; j < data.jobs.length; j++) {
        jobIdToRank[data.jobs[j].id.toString()] = j;
      }
    }
    if(data.shipments) {
      for (var j = 0; j < data.shipments.length; j++) {
        jobIdToRank[data.shipments[j].delivery.id.toString()] = j;
      }
    }

    var jobRank = 0;
    for (var s = 0; s < resultRoutes[i].steps.length; s++) {
      var step = resultRoutes[i].steps[s];
      if (step.type === 'job' || step.type === 'delivery') {
        jobRank++;

        var jobId = step.job.toString();

        data.jobsMarkers[jobId].setStyle({color: routeColor});

        // Add to solution display
        var nb_rows = solutionList.rows.length;
        var row = solutionList.insertRow(nb_rows);
        row.title = 'Click to center the map';

        // Hack to make sure the marker index is right.
        var showCallback = function(rank) {
          return function() {
            if(data.jobs) {
              _openJobPopup(data.jobs[rank]);
              centerJob(data.jobs[rank]);
            }
            if(data.shipments) {
              _openShipmentPopup(data.shipments[rank]);
              centerShipment(data.shipments[rank]);
            }
          };
        }
        row.onclick = showCallback(jobIdToRank[jobId]);

        var idCell = row.insertCell(0);
        idCell.setAttribute('class', 'rank solution-display');
        idCell.innerHTML = jobRank;

        var nameCell = row.insertCell(1);
        if(data.jobs && data.jobs[jobIdToRank[jobId]]) {
          nameCell.appendChild(
            document.createTextNode(data.jobs[jobIdToRank[jobId]].description)
          );
        }
        if(data.shipments && data.shipments[jobIdToRank[jobId]]) {
          nameCell.appendChild(
            document.createTextNode(data.shipments[jobIdToRank[jobId]].description)
          );
        }
      }
    }

    // Remember the path. This will cause hasSolution() to return true.
    routes.push(path);
  }

  fitView();
}

/*** Events ***/

// Fit event.
LSetup.map.on('fit', fitView);

// Clear event.
LSetup.map.on('clear', function() {
  // Remove controls.
  if (LSetup.map.fitControl) {
    LSetup.map.removeControl(LSetup.map.fitControl);
  }
  if (LSetup.map.clearControl) {
    LSetup.map.removeControl(LSetup.map.clearControl);
  }
  if (LSetup.map.solveControl) {
    LSetup.map.removeControl(LSetup.map.solveControl);
  }
  if (LSetup.map.summaryControl) {
    LSetup.map.removeControl(LSetup.map.summaryControl);
  }
  clearData();

  // Delete locations display in the right panel.
  LSetup.map.panelControl.clearDisplay();
});

// Collapse panel.
LSetup.map.on('collapse', function() {
  LSetup.map.collapseControl.toggle();
  LSetup.map.panelControl.toggle();
});

/*** end Events ***/

var setData = function(data) {
  clearData();

  for (var i = 0; i < data.vehicles.length; i++) {
    addVehicle(data.vehicles[i]);
  }

  if(!data.jobs && !data.shipments) return alert('No jobs or shipments found')
  if(data.jobs) {
    for (var i = 0; i < data.jobs.length; i++) {
      addJob(data.jobs[i]);
    }
  }
  if (data.shipments) {
    for (var i = 0; i < data.shipments.length; i++) {
      addShipment(data.shipments[i]);
    }
  }

  // Next user input should be a job.
  firstPlaceSet();
}

var setOverpassData = function(data) {
  for (var i = 0; i < data.length; i++) {
    if (getJobsSize() >= api.maxJobNumber) {
      alert('Request too large: ' + (data.length - i).toString() + ' POI discarded.');
      return;
    }
    var job = {
      id: data[i]['id'],
      description: data[i]['tags']['name'] || data[i]['id'],
      location: [data[i]['lon'], data[i]['lat']]
    }
    addJob(job);
  }
}

var setSolution = function(data) {
  if ('output' in data) {
    setOutput(data.output);
  }
}

module.exports = {
  fitView: fitView,
  clearData: clearData,
  getJobs: getJobs,
  getShipments: getShipments,
  getVehicles: getVehicles,
  showStart: showStart,
  setOutput: setOutput,
  getOutput: getOutput,
  addRoutes: addRoutes,
  getJobsSize: getJobsSize,
  getNextJobId: getNextJobId,
  getNextVehicleId: getNextVehicleId,
  closeAllPopups: closeAllPopups,
  isFirstPlace: isFirstPlace,
  hasCapacity: hasCapacity,
  firstPlaceSet: firstPlaceSet,
  addVehicle: addVehicle,
  markUnassigned: markUnassigned,
  centerJob: centerJob,
  addJob: addJob,
  checkControls: checkControls,
  setData: setData,
  setSolution: setSolution,
  getOverpassQuery: getOverpassQuery,
  setOverpassData: setOverpassData
};
