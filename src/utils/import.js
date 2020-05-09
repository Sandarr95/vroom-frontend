'use strict'
var xlsx = require('xlsx')
var geocoder = require('./geocoder');
var dataHandler = require('./data_handler');
var panelControl = require('../controls/panel');

module.exports = {
  readXlsx: readXlsx,
  fullXlsxSolution: fullXlsxSolution
}

var deliveryHeaders = [
  'city',
  'street',
  'postal_code',
  'first_name',
  'last_name',
  'email',
  'phone',
  'comment',
  'paidAmount',
  'paymentStatus'
]
var vehicleHeaders = [
  'name',
  'capacity',
]
var metaHeaders = [
  'full_address'
]

async function fullXlsxSolution(workbook) { try {
  var deliveryWS = workbook.Sheets[workbook.SheetNames[0]];
  var vehiclesWS = workbook.Sheets[workbook.SheetNames[1]];
  var metaWS = workbook.Sheets[workbook.SheetNames[2]];
  var deliveryJS = xlsx.utils.sheet_to_json(deliveryWS, { header: deliveryHeaders }).filter(d => d.paymentStatus !== 'Failed')
  var vehiclesJS = xlsx.utils.sheet_to_json(vehiclesWS, { header: vehicleHeaders })
  var metaJS = xlsx.utils.sheet_to_json(metaWS, { header: metaHeaders })
  var addressesNotFound = []
  var depoSearch = await search(metaJS[0].full_address)
  if(depoSearch[0])
    var depoLocation = l(depoSearch[0])
  else return addressesNotFound.push("Depo not found, check in 3rd sheet")
  var shipments = [], jobs = [];
  var jobsCreated = deliveryJS.map(async (delivery, i) => {
    delivery.description = createDeliveryDescription(delivery, i)
    var results = await search(delivery.street + ", " + delivery.city)
    if(results[0]) {
      delivery.location = l(results[0])
    } else {
      addressesNotFound.push(delivery.description)
      return;
    }
    var shipment = createShipment(-(-i), delivery.location, new Number(delivery.paidAmount) / 10, depoLocation)
    shipment.description = delivery.description
    shipments.push(shipment)
    return;
  })
  await Promise.all(jobsCreated)
  var vehicles = [], time_window = optimalVehicleTimeWindow(shipments, vehiclesJS)
  for(var i in vehiclesJS) {
    var vehicle = vehiclesJS[i]
    vehicle.description = createVehicleDescription(vehicle, i)
    var v = createVehicle(-(-i), vehicle.capacity, depoLocation, time_window)
    v.description = vehicle.description
    vehicles.push(v)
  }
  //console.log(jobs)
  console.log(shipments)
  console.log(vehicles)

  if(addressesNotFound.length) {
    alert("Some addresses were not found:\n" +
      addressesNotFound.reduce(function(all, cur) {
        return all + "- " + cur + "\n" 
      }, "")
    )
  }
  
  panelControl.hideInitDiv();
  dataHandler.setData({
    shipments: shipments,
    vehicles: vehicles
  });
  dataHandler.closeAllPopups();
  dataHandler.checkControls();
  dataHandler.fitView();
} catch (e) { console.log(e) }}

function createDelivery(id, location) {
  return {
    id: 13380000000000 + id,
    location: location,
    delivery: [ 0, 1 ]
  }
}

function createShipment(id, location, quantity, depoLocation) {
  return {
    delivery: {
      id: id,
      location: location,
      service: 120
    },
    pickup: {
      id: 13370000000000 + id,
      location: depoLocation,
      service: 10
    },
    amount: [ quantity ]
  }
}

function createVehicle(id, capacity, depoLocation, time_window) {
  return {
    id: id,
    start: depoLocation,
    end: depoLocation,
    capacity: [ capacity ],
    time_window: [ 0, time_window ]
  }
}

function createDeliveryDescription(delivery, i) {
  return (
    "#" + (1-(-i)) +
    "[" + delivery.first_name + " " + delivery.last_name + "]" +
    "[" + delivery.street + ", " + delivery.postal_code + ", " + delivery.city + "]"
  )
}

function createVehicleDescription(vehicle, i) {
  return (
    "V" + (1-(-i)) +
    "[" + vehicle.name + "]" +
    "[" + vehicle.capacity + "]"
  )
}

function optimalVehicleTimeWindow(shipments, vehicles) {
  var averageEstimatedTripTime = 100
  var serviceTime = shipments.reduce(function(acc, cur) {
    return acc + cur.delivery.service + cur.pickup.service + averageEstimatedTripTime
  }, 0);
  var vehicleDivider = vehicles.length;
  return Math.round(serviceTime / vehicleDivider);
}

function readXlsx(data) { try {
  console.log("Running calculation for xlsx")
  var xlsx_data = new Uint8Array(data);
  var workbook = xlsx.read(xlsx_data, {type: 'array'});
  return workbook;
} catch (e) {
  console.log(e) 
  return false;
}}

const search = (function(){
  return throttle(function(query) {
    return new Promise(function(res, rej){
      geocoder.defaultGeocoder.geocode(query, res)
    })
  }, 15)
})()

function l(result) {
  var {lat, lng} = result.center
  return [lng, lat]
}

function throttle(f, ms) {
  var scheduler = 0;
  return function() {
    var call_time = Date.now();
    var least_wait = scheduler + ms - call_time
    var inspect_scheduler = scheduler;
    var context = this, args = arguments;
    if(least_wait > 0) {
      scheduler = call_time + least_wait
      console.log('scheduling task', inspect_scheduler)
      return new Promise((res, rej) => {
        setTimeout(() => f.apply(context, args).then(res).catch(rej), least_wait)
      })
    } else {
      scheduler = call_time;
      console.log('invoke task directly', inspect_scheduler)
      return f.apply(context, args)
    }
  }
}