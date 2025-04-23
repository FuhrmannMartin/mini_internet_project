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

    const nodeColors = {
      tier1: "#e74c3c",
      ixp: "#f39c12",
      student: "#3498db",
      stub: "#7f8c8d"
    };

    if (!tracerouteData || !tracerouteData.routes) {
      console.warn("Invalid traceroute data.");
      return;
    }

    const asPath = [];
    const seen = new Set();
    const originASN = parseInt(document.getElementById("origin-as").value);

    if (!seen.has(originASN)) {
      asPath.push(originASN);
      seen.add(originASN);
    }

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

    // Highlight involved AS nodes
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

    // Add edges including IXP detection
    if (asPath.length > 1) {
      const tracerouteEdges = [];
      const allEdges = network.body.data.edges.get();
      const allEdgeSet = new Set(allEdges.map(e => `${e.from}->${e.to}`));
      const allNodesMap = new Map(network.body.data.nodes.get().map(n => [n.id, n]));

      for (let i = 0; i < asPath.length - 1; i++) {
        const from = asPath[i];
        const to = asPath[i + 1];
        const directEdge = `${from}->${to}`;
        const reverseEdge = `${to}->${from}`;

        if (allEdgeSet.has(directEdge) || allEdgeSet.has(reverseEdge)) {
          tracerouteEdges.push({
            from,
            to,
            color: { color: tracerouteColor },
            width: 3,
            dashes: false,
            arrows: 'to'
          });
        } else {
          // Look for a real IXP node connecting both ASes
          const ixpNode = Array.from(allNodesMap.values()).find(n =>
            n.type === "ixp" &&
            (allEdgeSet.has(`${from}->${n.id}`) || allEdgeSet.has(`${n.id}->${from}`)) &&
            (allEdgeSet.has(`${n.id}->${to}`) || allEdgeSet.has(`${to}->${n.id}`))
          );

          if (ixpNode) {
            tracerouteEdges.push(
              {
                from,
                to: ixpNode.id,
                color: { color: tracerouteColor },
                width: 3,
                dashes: true,
                arrows: 'to'
              },
              {
                from: ixpNode.id,
                to,
                color: { color: tracerouteColor },
                width: 3,
                dashes: true,
                arrows: 'to'
              }
            );
          } else {
            console.warn(`No direct edge or IXP found between AS${from} and AS${to}`);
          }
        }
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

  // 1. Remove old edges
  const previousEdges = window.currentNetwork.body.data.edges.get().filter(e =>
    e.color?.color === tracerouteColor
  );
  window.currentNetwork.body.data.edges.remove(previousEdges);

  // 2. Reset node colors
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
    type: n.type,
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

  // Assign globally so other functions can use it
  window.currentNetwork = new vis.Network(container, { nodes, edges }, {
    physics: false,
    layout: { improvedLayout: false },
    interaction: { dragNodes: false }
  });

  // Also save nodes globally for router type access
  window.currentNodes = nodes;
}

function showASLinkBetween(asn1, asn2) {
  const box = document.getElementById("router-connection-info");
  if (!box) return;

  const entry1 = allRouters[asn1];
  if (!entry1 || !Array.isArray(entry1.public_links)) return;

  const linksBetween = entry1.public_links.filter(link => link.peer_asn == asn2);

  if (linksBetween.length === 0) {
    box.innerHTML = `<strong>AS${asn1} ↔ AS${asn2}</strong><br/><em>No public links found between these ASes.</em>`;
  } else {
    box.innerHTML = `
      <strong>External Links between AS${asn1} and AS${asn2}:</strong>
      <ul class="list-disc pl-5 mt-2 space-y-1">
        ${linksBetween.map(link => `
          <li>
            AS${asn1}.${link.router} (${link.ip}) ↔ AS${asn2}.${link.peer_router} (${link.peer_ip})<br/>
            <span class="text-xs text-neutral-600">
              Role: ${link.role} ↔ ${link.peer_role} — Subnet: <code>${link.subnet}</code>
            </span>
          </li>
        `).join("")}
      </ul>
    `;
  }

  box.classList.remove("hidden");
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

  const network = window.currentNetwork;
  if (!network) {
    console.error("Network not loaded.");
    return;
  }

  network.on("click", function (params) {
    const box = document.getElementById("router-connection-info");
    if (!box) return;

    const isASNumber = id => /^\d+$/.test(id);

    if (params.edges.length > 0) {
      const edge = network.body.data.edges.get(params.edges[0]);
      const from = edge.from;
      const to = edge.to;

      if (isASNumber(from) && isASNumber(to)) {
        showASLinkBetween(from, to);
        return;
      }
    }

    box.classList.add("hidden");
    box.innerHTML = "";
  });
}

document.addEventListener("DOMContentLoaded", init);
