let allRouters = window.allRouters || {}; // Provided by Jinja in template

function updateOriginRouters(asn) {
  const routerSelect = document.getElementById("origin-router");
  routerSelect.innerHTML = "";

  const asEntry = allRouters[asn];
  const routers = asEntry?.routers || {};

  Object.entries(routers).forEach(([routerName, routerInfo]) => {
    const option = document.createElement("option");
    option.value = routerName;
    option.text = `${routerName}${routerInfo.is_border ? " *" : ""}`;
    routerSelect.appendChild(option);
  });

  if (routerSelect.options.length > 0) {
    routerSelect.selectedIndex = 0;
  }
}

function updateTargetRouters(asn) {
  const routerSelect = document.getElementById("target-router");
  routerSelect.innerHTML = "";

  const asEntry = allRouters[asn];
  const routers = asEntry?.routers || {};

  Object.entries(routers).forEach(([routerName, routerInfo]) => {
    const option = document.createElement("option");
    option.value = routerName;
    option.text = `${routerName}${routerInfo.is_border ? " *" : ""}`;
    routerSelect.appendChild(option);
  });

  if (routerSelect.options.length > 0) {
    routerSelect.selectedIndex = 0;
    updateTargetIP(routerSelect.value, asn);
  }

  bindTargetRouterListener(asn);
}

function updateTargetIP(routerName, asn) {
  const viaSelect = document.getElementById("target-ip");
  viaSelect.innerHTML = "";

  const asEntry = allRouters[asn];
  const router = asEntry?.routers?.[routerName];

  if (!router || !Array.isArray(router.interfaces)) {
    console.warn(`No interfaces found for router ${routerName} in AS ${asn}`);
    return;
  }

  router.interfaces
    .filter((intf) => intf.type === "internal" || intf.type === "loopback")
    .forEach((intf) => {
      const option = document.createElement("option");
      option.value = intf.ip;
      option.text = `${intf.ip} (${intf.type})`;
      viaSelect.appendChild(option);
    });

  if (viaSelect.options.length > 0) {
    viaSelect.selectedIndex = 0;
  }
}

function bindTargetRouterListener(asn) {
  const targetRouterSelect = document.getElementById("target-router");
  if (targetRouterSelect) {
    targetRouterSelect.addEventListener("change", e => {
      updateTargetIP(e.target.value, asn);
    });
  }
}

function runTraceroute() {
  resetVisualization();

  const origin = document.getElementById("origin-as").value;
  const originRouter = document.getElementById("origin-router").value;
  const target = document.getElementById("target-as").value;
  const targetRouter = document.getElementById("target-router").value;
  const targetIP = document.getElementById("target-ip").value;

  const originContainer = allRouters[origin]?.routers?.[originRouter]?.container || "unknown";

  if (!origin || !originRouter || !target || !targetRouter || !targetIP) {
    alert("Please select Origin AS + Router and Target AS + Router + IP.");
    return;
  }

  console.log(`[traceroute] From AS${origin} ${originRouter} to AS${target} ${targetRouter} [${targetIP}]`);

  const box = document.getElementById("traceroute-result");
  box.classList.remove("hidden");
  box.innerHTML = `<em class="text-neutral-500">Running traceroute...</em>`;

  fetch("/launch-traceroute", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      container: originContainer,
      target_ip: targetIP
    })
  })
    .then((res) => res.json())
    .then((data) => {
      if (!data.job_id) {
        box.innerHTML = `<strong>Error:</strong> Server did not return job ID.`;
        return;
      }

      const jobId = data.job_id;
      const originText = `AS${origin} (${originRouter})`;
      const targetText = `AS${target} (${targetRouter})`;

      // Log the polling endpoint to console
      const pollURL = `/get-traceroute-result?job_id=${jobId}`;
      console.log(`[Traceroute] Poll result at: ${pollURL}`);

      const pollInterval = setInterval(() => {
        fetch(`/get-traceroute-result?job_id=${jobId}`)
          .then((res) => res.json())
          .then((result) => {
            if (result.status === "pending") return;

            clearInterval(pollInterval);

            if (result.error) {
              box.innerHTML = `<strong>Error:</strong> ${result.error}`;
              return;
            }

            box.innerHTML = `
              <div class="mb-2">
                <strong>Traceroute:</strong> ${originText} &rarr; ${targetText} [${result.target_ip}]
              </div>
              <details class="mt-4 text-sm" open>
                <summary class="cursor-pointer text-blue-600">Show raw output</summary>
                <pre class="bg-neutral-100 text-xs p-2 mt-2 rounded border">${result.raw_output}</pre>
              </details>
              <hr class="mt-4 border-neutral-300" />
              <div class="text-xs text-neutral-500 mt-2">
                Recorded at: ${result.timestamp}
              </div>
            `;

            if (window.currentNetwork && window.currentNodes?.get && window.currentNodes?.update) {
              drawTraceroutePath(window.currentNetwork, window.currentNodes, result);
            }

            box.scrollIntoView({ behavior: "smooth" });
          })
          .catch((err) => {
            clearInterval(pollInterval);
            console.error("Polling failed:", err);
            box.innerHTML = `<strong>Error:</strong> Failed while polling traceroute result.`;
          });
      }, 2000); // poll every 2 seconds
    })
    .catch((err) => {
      console.error("Traceroute launch failed:", err);
      box.innerHTML = `<strong>Error:</strong> Failed to launch traceroute.`;
    });
}

function drawTraceroutePath(network, allNodes, tracerouteData) {
  try {
    const tracerouteColor = '#8e44ad';

    // These match the ones from loadTopology
    const nodeColors = {
      tier1: "#e74c3c",
      ixp: "#f39c12",
      student: "#3498db",
      stub: "#7f8c8d"
    };

    // Bail if no traceroute
    if (!tracerouteData || !tracerouteData.routes) {
      console.warn("Invalid traceroute data.");
      return;
    }

    const asPath = [];
    const seen = new Set();

    // Include origin AS
    const originASN = parseInt(document.getElementById("origin-as").value);
    if (!seen.has(originASN)) {
      asPath.push(originASN);
      seen.add(originASN);
    }

    // Parse ASN from probe IPs using allRouters
    for (const hop of tracerouteData.routes.hops || tracerouteData.routes) {
      for (const probe of hop.probes || []) {
        const probeIp = probe.ip;
        let asn = null;

        for (const [asnKey, asEntry] of Object.entries(allRouters)) {
          for (const router of Object.values(asEntry.routers || {})) {
            if (router.interfaces?.some(iface => iface.ip === probeIp)) {
              asn = parseInt(asnKey);
              break;
            }
          }
          if (asn !== null) break;
        }

        if (asn !== null && !seen.has(asn)) {
          asPath.push(asn);
          seen.add(asn);
        }
      }
    }

    if (asPath.length === 0) {
      console.warn("No AS path found in traceroute.");
      return;
    }

    // Highlight involved nodes
    for (const asn of asPath) {
      allNodes.update({
        id: asn,
        color: {
          background: tracerouteColor,
          border: tracerouteColor,
          highlight: {
            background: tracerouteColor,
            border: tracerouteColor
          }
        },
        font: {
          color: '#ffffff'
        }
      });
    }

    // Draw traceroute edges (if multiple ASes involved)
    if (asPath.length > 1) {
      const tracerouteEdges = [];
      for (let i = 0; i < asPath.length - 1; i++) {
        tracerouteEdges.push({
          from: asPath[i],
          to: asPath[i + 1],
          color: { color: tracerouteColor },
          width: 3,
          dashes: false,
          arrows: 'to'
        });
      }

      network.body.data.edges.add(tracerouteEdges);
    }

  } catch (err) {
    console.error("Failed to draw traceroute:", err);
  }
}

function resetVisualization() {
  const tracerouteColor = '#8e44ad';

  const nodeColors = {
    tier1: "#e74c3c",
    ixp: "#f39c12",
    student: "#3498db",
    stub: "#7f8c8d"
  };

  if (!window.currentNetwork || !window.currentNodes) return;

  // 1. Entferne alte Traceroute-Kanten
  const previousEdges = window.currentNetwork.body.data.edges.get().filter(e =>
    e.color?.color === tracerouteColor
  );
  window.currentNetwork.body.data.edges.remove(previousEdges);

  // 2. Setze alle Node-Farben zurück
  window.currentNodes.get().forEach(node => {
    const originalColor = nodeColors[node.type] || "#ccc";
    window.currentNodes.update({
      id: node.id,
      color: {
        background: originalColor,
        border: originalColor,
        highlight: {
          background: originalColor,
          border: originalColor
        }
      },
      font: {
        color: '#222222'
      }
    });
  });
}

async function loadTopology() {
  let data;
  try {
    const response = await fetch('/static/topology.json');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    data = await response.json();
  } catch (err) {
    console.error("Failed to load topology:", err);
    return;
  }

  const nodeColors = {
    tier1: "#e74c3c",
    ixp: "#f39c12",
    student: "#3498db",
    stub: "#7f8c8d"
  };

  const nodes = new vis.DataSet(data.nodes.map(n => ({
    id: n.id,
    label: n.type === 'ixp' ? `IXP ${n.id}` : n.label,
    type: n.type, // ? Store the type for future resets
    color: nodeColors[n.type] || "#ccc",
    x: n.x,
    y: n.y,
    fixed: { x: true, y: true },
    shape: n.type === 'ixp' ? 'box' : 'circle'
  })));

  const edges = new vis.DataSet(data.edges.map(e => ({
    from: e.from,
    to: e.to,
    color: e.type === "prov" ? "red" : "green",
    dashes: e.type !== "prov",
    arrows: ""
  })));

  const container = document.getElementById("network");
  const network = new vis.Network(container, { nodes, edges }, {
    physics: false,
    layout: { improvedLayout: false },
    interaction: { dragNodes: false }
  });

  window.currentNetwork = network;
  window.currentNodes = nodes;
}

async function init() {
  await loadTopology();

  const runBtn = document.getElementById("run-traceroute-btn");
  if (runBtn) {
    runBtn.addEventListener("click", runTraceroute);
  }

  const originAS = document.getElementById("origin-as");
  if (originAS) {
    originAS.addEventListener("change", e => {
      updateOriginRouters(e.target.value);
    });
    updateOriginRouters(originAS.value);
  }

  const targetAS = document.getElementById("target-as");
  if (targetAS) {
    targetAS.addEventListener("change", e => {
      updateTargetRouters(e.target.value);
    });
    updateTargetRouters(targetAS.value);
  }
}

document.addEventListener("DOMContentLoaded", init);
