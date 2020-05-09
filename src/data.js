'use strict';

var jobs = [];
var vehicles = [];
var shipments = [];

// Stored with job id as key.
var jobsMarkers = {};

// Stored with vehicle id + {_start,_end} as key
var vehiclesMarkers = {};

var maxJobId = 0;
var maxVehicleId = 0;

module.exports = {
  jobs: jobs,
  shipments: shipments,
  maxJobId: maxJobId,
  maxVehicleId: maxVehicleId,
  vehicles: vehicles,
  jobsMarkers: jobsMarkers,
  vehiclesMarkers: vehiclesMarkers
};
