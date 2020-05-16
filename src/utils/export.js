const xlsx = require('xlsx')
const {
  getOutput, getShipments, getVehicles, getSourceData
} = require('./data_handler')

module.exports = exportSolution;

const addMeta = ({ source, sourceKey, destinationKey }) => obj => {
  try {
    var tempObj = {};
    tempObj[destinationKey] = source[obj[sourceKey]];
    return {...obj, ...tempObj};
  } catch(e) { console.log(e); return obj }
}

function partitionRoutes(steps) {
  return steps.reduce((routes, step) => {
    var route = routes.slice(-1)[0]
    if(step.type === 'pickup' && route.length > 0) {
      return [...routes, []]
    } else if (step.type === 'delivery') {
      route.push(step)
    }
    return routes
  }, [[]])
}

const formatRoutes = (vehicles, ...metas) => route => ({
  vehicle: vehicles[route.vehicle],
  routes: partitionRoutes(route.steps).map(r => {
    var metaAdders = metas.map(addMeta)
    return r.map(r => metaAdders.reduce((obj, fn) => fn(obj), r))
  })
})

const routeHeaders = ['city', 'street', 'postal_code', 'first_name', 'last_name', 'email', 'phone', 'comment', 'paidAmount', 'aantal', 'regel in origineel document']
function routeAoA({
  cells:{ city, street, postal_code, first_name, last_name, email, phone, comment, paidAmount, __rowNum__ } = {},
  shipment: { amount:[amount] = []} = {}
}) {
  return [city, street, postal_code, first_name, last_name, email, phone, comment, paidAmount, amount, (1-(-__rowNum__))]
}

async function exportSolution() {
  const solution = getOutput();
  const shipments = getShipments();
  const { vehiclesJS, deliveryJS } = getSourceData();
  const routeFormatter = formatRoutes(vehiclesJS, {
    source: deliveryJS,
    sourceKey: 'job',
    destinationKey: 'cells'
  }, {
    source: shipments,
    sourceKey: 'job',
    destinationKey: 'shipment'
  })

  const solutions = solution.routes.map(routeFormatter)

  const exportWorkbook = xlsx.utils.book_new();
  for(const solution of solutions) {
    for(const i in solution.routes) {
      const route = solution.routes[i]
      const routeArrayOfArray = route.map(routeAoA)

      const ws_name = solution.vehicle.name + " route#" + (1-(-i)) + " capaciteit#" + solution.vehicle.capacity
      const ws = xlsx.utils.aoa_to_sheet([routeHeaders, ...routeArrayOfArray]);
      xlsx.utils.book_append_sheet(exportWorkbook, ws, ws_name);
    }
  }
  xlsx.writeFile(exportWorkbook, 'resultRoutes.xlsb');
}
