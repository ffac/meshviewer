define({
  "dataPath": "data/",
  "siteName": "Freifunk Regio Aachen",
  "mapSigmaScale": 0.5,
  "showContact": true,
  "maxAge": 14,
  "mapLayers": [
    { "name": "MapQuest",
      "url": "https://otile{s}-s.mqcdn.com/tiles/1.0.0/osm/{z}/{x}/{y}.jpg",
      "config": {
        "subdomains": "1234",
        "type": "osm",
        "attribution": "Tiles &copy; <a href=\"https://www.mapquest.com/\" target=\"_blank\">MapQuest</a>, Data CC-BY-SA OpenStreetMap",
        "maxZoom": 18
      }
    },
    {
      "name": "Stamen.TonerLite"
    }
  ],
  "nodeCharts": [
    {
      "name": "Statistik",
      "zoom": {
        "enabled": true,
        "levels": [
          { "label": "8h", "from": "8h", "group": "15min", },
          { "label": "24h", "from": "26h", "group": "1h"  },
          { "label": "1m", "from": "1mon", "group": "1d" },
          { "label": "1y", "from": "1y", "group": "1mon" },
        ]
      },
      "data": {
        "urls": function (node, zoom) {
          var baseUrl = "http://137.226.33.62:8002/render?format=json&from=-" + zoom.config.from
          var id = node.nodeinfo.node_id
          //FIXME: Migrate node ids in Graphite
          var regex = /^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i;
          var match = regex.exec(id);
          if (match)
            id = match[1] + ':' + match[2] + ':' + match[3] + ':' + match[4] + ':' + match[5]+':'+ match[6];
          return [
            baseUrl + "&target=alias(summarize(freifunk.nodes-legacy." + id + ".clientcount,\"" + zoom.config.group + "\",\"max\"),\"clients\")" +
            "&target=alias(summarize(freifunk.nodes-legacy." + id + ".loadavg,\"" + zoom.config.group + "\",\"avg\"),\"load\")" +
            "&target=alias(summarize(freifunk.nodes-legacy." + id + ".uptime,\"" + zoom.config.group + "\",\"last\"),\"uptime\")"
          ]
        },
        "format": {
          "load": ".2r",
          "clients": function (d) { return Math.ceil(d) },
          "uptime": function (d) { return d / 86400 }
        }
      },
      "c3": {
        "data": {
          "keys": {
            "x": "time",
            "value": ["clients", "load", "uptime"]
          },
          "colors": {
            "clients": "#1566A9",
            "load": "#1566A9",
            "uptime": "#1566A9"
          },
          "names": {
            "clients": "Clients",
            "load": "Load",
            "uptime": "Uptime"
          },
          "hide": [ "load", "uptime" ]
        },
        "tooltip": {
          "format": {
            "value": function (d, ratio, id) {
              switch (id) {
                case "uptime":
                  return d.toFixed(1) + " Tage"
                default:
                  return d
              }
            }
          }
        },
        "axis": {
          "x": {
            "tick": {
              "format": function(d, zoom) {
                var pad = function(number, pad) {
                  var N = Math.pow(10, pad);
                  return number < N ? ("" + (N + number)).slice(1) : "" + number
                }
                switch (zoom.level) {
                  case 0: // 8h
                  case 1: // 24h
                    return pad(d.getHours(),2) + ":" + pad(d.getMinutes(),2);
                  case 2: // 1m
                    return pad(d.getDate(),2) + "." + pad(d.getMonth()+1,2)
                  case 3: // 1y
                    return ["Jan", "Feb", "Mrz", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"][d.getMonth()]
                  default:
                    break;
                }
              },
              "rotate": -45
            }
          }
        }
      }
    }
  ]
})
