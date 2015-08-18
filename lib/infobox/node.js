define(["moment", "numeral", "tablesort", "c3", "d3", "deepmerge", "tablesort.numeric"],
  function (moment, numeral, Tablesort, c3, d3, merge) {
  function showGeoURI(d) {
    function showLatitude(d) {
      var suffix = Math.sign(d) > -1 ? "' N" : "' S"
      d = Math.abs(d)
      var a = Math.floor(d)
      var min = (d * 60) % 60
      a = (a < 10 ? "0" : "") + a

      return a + "° " + numeral(min).format("0.000") + suffix
    }

    function showLongitude(d) {
      var suffix = Math.sign(d) > -1 ? "' E" : "' W"
      d = Math.abs(d)
      var a = Math.floor(d)
      var min = (d * 60) % 60
      a = (a < 100 ? "0" + (a < 10 ? "0" : "") : "") + a

      return a + "° " + numeral(min).format("0.000") + suffix
    }

    if (!has_location(d))
      return undefined

    return function (el) {
      var latitude = d.nodeinfo.location.latitude
      var longitude = d.nodeinfo.location.longitude
      var a = document.createElement("a")
      a.textContent = showLatitude(latitude) + " " +
                      showLongitude(longitude)

      a.href = "geo:" + latitude + "," + longitude
      el.appendChild(a)
    }
  }

  function showFirmware(d) {
    var release = dictGet(d.nodeinfo, ["software", "firmware", "release"])
    var base = dictGet(d.nodeinfo, ["software", "firmware", "base"])

    if (release === null || base === null)
      return undefined

    return release + " / " + base
  }

  function showUptime(d) {
    if (!("uptime" in d.statistics))
      return undefined

    return moment.duration(d.statistics.uptime, "seconds").humanize()
  }

  function showFirstseen(d) {
    if (!("firstseen" in d))
      return undefined

    return d.firstseen.fromNow(true)
  }

  function showClients(d) {
    if (!d.flags.online)
      return undefined

    return function (el) {
      el.appendChild(document.createTextNode(d.statistics.clients > 0 ? d.statistics.clients : "keine"))
      el.appendChild(document.createElement("br"))

      var span = document.createElement("span")
      span.classList.add("clients")
      span.textContent = " ".repeat(d.statistics.clients)
      el.appendChild(span)
    }
  }

  function showIPs(d) {
    var ips = dictGet(d.nodeinfo, ["network", "addresses"])
    if (ips === null)
      return undefined

    ips.sort()

    return function (el) {
      ips.forEach( function (ip, i) {
        var link = !ip.startsWith("fe80:")

        if (i > 0)
          el.appendChild(document.createElement("br"))

        if (link) {
          var a = document.createElement("a")
          a.href = "http://[" + ip + "]/"
          a.textContent = ip
          el.appendChild(a)
        } else
          el.appendChild(document.createTextNode(ip))
      })
    }
  }

  function showBar(className, v) {
    var span = document.createElement("span")
    span.classList.add("bar")
    span.classList.add(className)

    var bar = document.createElement("span")
    bar.style.width = (v * 100) + "%"
    span.appendChild(bar)

    var label = document.createElement("label")
    label.textContent = (Math.round(v * 100)) + " %"
    span.appendChild(label)

    return span
  }

  function showRAM(d) {
    if (!("memory_usage" in d.statistics))
      return undefined

    return function (el) {
      el.appendChild(showBar("memory-usage", d.statistics.memory_usage))
    }
  }

  function showAutoupdate(d) {
    var au = dictGet(d.nodeinfo, ["software", "autoupdater"])
    if (!au)
      return undefined

    return au.enabled ? "aktiviert (" + au.branch + ")" : "deaktiviert"
  }

  function showChart(chartConfig, d) {
    var chart, zoom, config
    var cache =  {}

   config = merge({
      "data": {
        "parse": function(results, zoom) {
          var data = []
          results.forEach(function(d) {
            // Assuming influx data
            if (d.results && d.results[0] && d.results[0].series && d.results[0].series[0])
              d.results[0].series[0].values.forEach(function (vs) {
                var tmp = {}
                vs.forEach(function (v, k) {
                  var target = d.results[0].series[0].columns[k]
                  if (config.data.format && config.data.format[target])
                    v = (typeof config.data.format[target] === "function" ?
                      config.data.format[target](v, zoom) :
                      d3.format(config.data.format[target])(v))
                  tmp[target] = (v === null ? 0 : v)
                })
                data.push(tmp)
              })
            else if (d[0] && d[0].target && d[0].datapoints)
            // Assuming graphite data
              d[0].datapoints.forEach(function(dp, dpk) {
                var tmp = { "time": new Date(dp[1] * 1000) }
                for (var i = 0; i < d.length; i++) {
                  var target = d[i].target
                  var v = (d[i].datapoints[dpk] ? d[i].datapoints[dpk][0] : 0)
                  v = (typeof config.data.format[target] === "function" ?
                    config.data.format[target](v, zoom) :
                    d3.format(config.data.format[target])(v))
                  tmp[target] = (v === null ? 0 : v)
                }
                data.push(tmp)
              })
          })
          return data
        }
      },
      "c3": {
        "size": {
          "height": 240
        },
        padding: {
          bottom: 30
        },
        "legend": {
          "item": {
            "onclick": function(id) {
              if (config.data.toggle)
                config.data.toggle.call(this, id)
              this.api.hide()
              this.api.show(id)
            }
          }
        },
        "data": {},
        "axis": {
          "x": {
            "type": "timeseries"
          },
          "y": {
            "min": 0,
            "padding": {
              "bottom": 0
            }
          }
        }

      }

    }, chartConfig)

    zoom = {
      "level": 0,
      "buttons": [],
      "config": config.zoom && config.zoom.levels && config.zoom.levels[0] ? config.zoom.levels[0] : null,
      "enabled": config.zoom && config.zoom.enabled && config.zoom.levels && config.zoom.levels.length > 0
    }

    // Let's allow x axis configuration based on zoom level
    if (config.c3.axis.x.tick && config.c3.axis.x.tick.format && typeof config.c3.axis.x.tick.format === "function") {
      if (config.c3.axis.x.tick.format && !config.c3.axis.x.tick._format)
      config.c3.axis.x.tick._format = config.c3.axis.x.tick.format
      config.c3.axis.x.tick.format = function (val) {
          return config.c3.axis.x.tick._format(val, zoom)
      }
    }

    var div = document.createElement("div")
    div.classList.add("chart")
    var h4 = document.createElement("h4")
    h4.textContent = config.name
    div.appendChild(h4)

    var getData = function(callback) {
      var cacheKey = d.nodeinfo.node_id + "-" + zoom.level
      if (cache[cacheKey])
        return callback(cache[cacheKey])
      else {
        var urls = (typeof config.data.urls === "function" ? config.data.urls(d, zoom) : config.data.urls)
        Promise.all(urls.map(getJSON)).then(function(data) {
          data = config.data.parse ? config.data.parse(data, zoom) : data
          cache[cacheKey] = data
          callback(data)
        })
      }
    }

    var updateChart = function(data) {
      config.c3.data.json = data
      chart.load(config.c3.data)
    }

    var drawChart = function(data) {
      config.c3.data.json = data
      try {
        chart = c3.generate(config.c3)
      } catch(err) {
        console.log(err)
      }
      div.appendChild(chart.element)

      // Draw zoom controls
      if (zoom.enabled) {
        var zoomDiv = document.createElement("div")
        zoomDiv.classList.add("zoom-buttons")

        config.zoom.levels.forEach(function(v, level) {
          var btn = document.createElement("button")
          btn.classList.add("zoom-button")
          btn.setAttribute("data-zoom-level", level)
          if (level === zoom.level)
            btn.classList.add("active")
          btn.onclick = function() {
            if (level !== zoom.level) {
              zoom.buttons.forEach(function (v, k) {
                if (level !== k)
                  v.classList.remove("active")
                else
                  v.classList.add("active")
              })
              zoom.level = level
              zoom.config = v
              getData(updateChart)
            }
          }
          btn.textContent = v.label
          zoom.buttons[level] = btn
          zoomDiv.appendChild(btn)
        })
        div.appendChild(zoomDiv)
      }

    }


    getData(drawChart)

    return div
  }

  function showStatImg(o, nodeId) {
    var content, caption

    if (o.thumbnail) {
      content = document.createElement("img")
      content.src = o.thumbnail.replace("{NODE_ID}", nodeId)
    }

    if (o.caption) {
      caption = o.caption.replace("{NODE_ID}", nodeId)

      if (!content)
        content = document.createTextNode(caption)
    }

    var p = document.createElement("p")

    if (o.href) {
      var link = document.createElement("a")
      link.target = "_blank"
      link.href = o.href.replace("{NODE_ID}", nodeId)
      link.appendChild(content)

      if (caption && o.thumbnail)
        link.title = caption

      p.appendChild(link)
    } else
      p.appendChild(content)

    return p
  }

  return function(config, el, router, d) {
    var h2 = document.createElement("h2")
    h2.textContent = d.nodeinfo.hostname
    var span = document.createElement("span")
    span.classList.add(d.flags.online ? "online" : "offline")
    span.textContent = " (" + (d.flags.online ? "online" : "offline, " + d.lastseen.fromNow(true)) + ")"
    h2.appendChild(span)
    el.appendChild(h2)

    var attributes = document.createElement("table")
    attributes.classList.add("attributes")

    attributeEntry(attributes, "Gateway", d.flags.gateway ? "ja" : null)
    attributeEntry(attributes, "Koordinaten", showGeoURI(d))

    if (config.showContact)
      attributeEntry(attributes, "Kontakt", dictGet(d.nodeinfo, ["owner", "contact"]))

    attributeEntry(attributes, "Hardware",  dictGet(d.nodeinfo, ["hardware", "model"]))
    attributeEntry(attributes, "Primäre MAC", dictGet(d.nodeinfo, ["network", "mac"]))
    attributeEntry(attributes, "Node ID", dictGet(d.nodeinfo, ["node_id"]))
    attributeEntry(attributes, "Firmware", showFirmware(d))
    attributeEntry(attributes, "Uptime", showUptime(d))
    attributeEntry(attributes, "Teil des Netzes", showFirstseen(d))
    attributeEntry(attributes, "Arbeitsspeicher", showRAM(d))
    attributeEntry(attributes, "IP Adressen", showIPs(d))
    attributeEntry(attributes, "Autom. Updates", showAutoupdate(d))
    attributeEntry(attributes, "Clients", showClients(d))

    el.appendChild(attributes)

    if (!d.flags.gateway && config.nodeCharts)
      config.nodeCharts.forEach( function (chartConfig) {
        el.appendChild(showChart(chartConfig, d))
      })

    if (!d.flags.gateway && config.nodeInfos)
      config.nodeInfos.forEach( function (nodeInfo) {
        var h4 = document.createElement("h4")
        h4.textContent = nodeInfo.name
        el.appendChild(h4)
        el.appendChild(showStatImg(nodeInfo, d.nodeinfo.node_id))
      })

    if (d.neighbours.length > 0) {
      var h3 = document.createElement("h3")
      h3.textContent = "Nachbarknoten (" + d.neighbours.length + ")"
      el.appendChild(h3)

      var table = document.createElement("table")
      var thead = document.createElement("thead")

      var tr = document.createElement("tr")
      var th1 = document.createElement("th")
      th1.textContent = "Knoten"
      th1.classList.add("sort-default")
      tr.appendChild(th1)

      var th2 = document.createElement("th")
      th2.textContent = "TQ"
      tr.appendChild(th2)

      var th3 = document.createElement("th")
      th3.textContent = "Entfernung"
      tr.appendChild(th3)

      thead.appendChild(tr)
      table.appendChild(thead)

      var tbody = document.createElement("tbody")

      d.neighbours.forEach( function (d) {
        var tr = document.createElement("tr")

        var td1 = document.createElement("td")
        var a1 = document.createElement("a")
        a1.classList.add("hostname")
        a1.textContent = d.node.nodeinfo.hostname
        a1.href = "#"
        a1.onclick = router.node(d.node)
        td1.appendChild(a1)

        if (d.link.vpn)
          td1.appendChild(document.createTextNode(" (VPN)"))

        if (has_location(d.node)) {
          var span = document.createElement("span")
          span.classList.add("icon")
          span.classList.add("ion-location")
          td1.appendChild(span)
        }

        tr.appendChild(td1)

        var td2 = document.createElement("td")
        var a2 = document.createElement("a")
        a2.href = "#"
        a2.textContent = showTq(d.link)
        a2.onclick = router.link(d.link)
        td2.appendChild(a2)
        tr.appendChild(td2)

        var td3 = document.createElement("td")
        var a3 = document.createElement("a")
        a3.href = "#"
        a3.textContent = showDistance(d.link)
        a3.onclick = router.link(d.link)
        td3.appendChild(a3)
        td3.setAttribute("data-sort", d.link.distance !== undefined ? -d.link.distance : 1)
        tr.appendChild(td3)

        tbody.appendChild(tr)
      })

      table.appendChild(tbody)

      new Tablesort(table)

      el.appendChild(table)
    }
  }
})
