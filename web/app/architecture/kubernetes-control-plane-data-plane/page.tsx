"use client";
import {useState} from "react";
import Link from "next/link";

const tabs=[
{id:"runtime",label:"1 · Container runtime",intro:"How a Pod becomes Linux processes",items:[
["Scheduler binds the Pod","The scheduler chooses a node and writes the binding. It does not start containers."],
["kubelet observes the Pod","The node's kubelet watches the API and reconciles Pods assigned to this node."],
["CRI gRPC → containerd CRI plugin","Kubelet calls the CRI RuntimeService and ImageService over a Unix socket. CRI is the contract; containerd is one implementation."],
["RunPodSandbox","The CRI plugin creates the Pod sandbox: a stable network namespace boundary, commonly held by a tiny pause container. This gives containers in the Pod a shared network namespace."],
["CNI ADD","During sandbox networking, the runtime invokes configured CNI plugins. They create/configure the Pod interface, IP address, routes and related dataplane state. CNI is networking, not container creation."],
["Pull image","Kubelet asks the CRI ImageService to pull the image. containerd stores image content and snapshots layers into a root filesystem."],
["CreateContainer + StartContainer","CRI asks containerd to create the application container in the Pod sandbox. containerd uses an OCI runtime such as runc, commonly via containerd-shim-runc-v2."],
["Linux kernel isolation","The OCI runtime configures namespaces, cgroups, capabilities, mounts and security settings, then execs the container process. The kernel—not Kubernetes—enforces these primitives."],
["Pod becomes Running / Ready","Kubelet reports status. Readiness probes decide whether the Pod should receive normal Service traffic; Running alone does not mean Ready."]
]},
{id:"storage",label:"2 · Volumes & CSI",intro:"How persistent storage reaches a process",items:[
["Application asks for storage","A Pod declares volumes and volumeMounts. A PVC asks for capacity, access mode and optionally a StorageClass."],
["PVC ↔ PV binding","The control plane's PV controller binds a compatible claim to a PersistentVolume. A StorageClass describes the provisioner and parameters; it is not the disk itself."],
["Dynamic provisioning (if configured)","The external-provisioner sidecar watches PVCs and calls the CSI controller plugin CreateVolume. The resulting backend disk/share is represented by a PV."],
["Attach (when required)","The attach/detach controller and CSI external-attacher coordinate ControllerPublishVolume. Not every storage backend needs a separate attach operation."],
["Node stage / publish","On the selected node, kubelet talks to the CSI node plugin. NodeStageVolume (if supported) prepares the device/filesystem; NodePublishVolume mounts it at the Pod volume path."],
["Container mount","Kubelet/runtime exposes the prepared Pod volume at each container's volumeMount.mountPath. The application sees a directory, not a PVC object."],
["Pod replacement","A replacement Pod can mount the same claim if topology, access mode, attachment and filesystem rules permit. Data lifetime is independent of a single container."],
["Deletion policy matters","PVC/PV reclaim policy and StatefulSet PVC retention policy determine what is retained or deleted. Never assume deleting a Pod deletes its persistent data."]
]},
{id:"network",label:"3 · Service, DNS & traffic",intro:"Name resolution is not packet forwarding",items:[
["Client asks DNS","A Pod's resolver sends a query to cluster DNS, commonly CoreDNS, using its configured nameserver and search domains."],
["CoreDNS answers","CoreDNS watches Kubernetes Service and EndpointSlice data. A normal Service name resolves to its ClusterIP; a headless Service resolves to endpoint Pod IPs."],
["Client connects to ClusterIP:port","The Service VIP is a virtual address. DNS has only returned an address; it has not selected a backend or forwarded packets."],
["Service dataplane selects endpoint","kube-proxy watches Services and EndpointSlices and programs node packet rules (mode-dependent). Cilium can provide an eBPF Service implementation instead of kube-proxy when configured."],
["EndpointSlice is backend inventory","The EndpointSlice controller publishes matching Pod IPs and ports, with readiness/serving/terminating conditions. It is control-plane data, not a proxy."],
["Packet reaches Pod IP:targetPort","The dataplane translates/forwards Service traffic to a backend endpoint. CNI routes packets between Pods/nodes; NetworkPolicy enforcement is implemented by the network plugin."],
["Readiness changes traffic eligibility","When a Pod is not Ready, its endpoint conditions normally remove it from ordinary Service load balancing. Termination and publishNotReadyAddresses can affect details."]
]},
{id:"stateful",label:"4 · Stateful workloads",intro:"Stable identity plus stable storage",items:[
["StatefulSet controller","Creates ordinal Pods such as ledger-0, ledger-1, ledger-2 and manages their ordered identity and rollout semantics."],
["Headless governing Service","A Service with clusterIP: None provides stable per-Pod DNS identities; it does not allocate a VIP and kube-proxy does not load-balance it."],
["Per-replica PVC from volumeClaimTemplates","The StatefulSet creates a distinct claim for each ordinal, for example data-ledger-0. Each claim binds to its own PV/backend volume."],
["Pod DNS identity","A Pod can be addressed as ledger-0.ledger.default.svc.cluster.local (assuming namespace default and cluster domain cluster.local)."],
["Reschedule and recover","If ledger-1 is recreated, the StatefulSet identity and its claim let the replacement reattach the corresponding data, subject to storage topology and access constraints."],
["Application-level replication is separate","StatefulSet does not make PostgreSQL/Kafka replicated or consistent. The application still owns leader election, quorum, replication, fencing, backup and recovery."]
]}
];

const operations=[
{id:"apply",label:"kubectl apply",command:"kubectl apply -f app.yaml",steps:[["API server","AuthN, AuthZ, admission, schema validation and accepted object write."],["etcd","Persists desired state."],["Deployment controller","Creates/updates a ReplicaSet."],["ReplicaSet controller","Creates Pods to satisfy replica count."],["Scheduler","Binds each unscheduled Pod to a node."],["Node kubelet","Reconciles assigned Pod through CRI; mounts volumes and manages probes."],["EndpointSlice controller","Publishes eligible Pod endpoints for matching Services."]]},
{id:"patch",label:"Patch image",command:"kubectl set image deployment/api api=example/api:v2",steps:[["API server + etcd","Persists changed Pod template."],["Deployment controller","Creates a new ReplicaSet revision."],["ReplicaSet controllers","Scale new and old ReplicaSets according to rolling update strategy."],["Scheduler + kubelet","Schedule and start new Pods; old Pods terminate as rollout advances."],["Service dataplane","Ready new endpoints receive traffic as EndpointSlices and node rules converge."]]},
{id:"delete",label:"Delete a Pod",command:"kubectl delete pod api-xxxxx",steps:[["API server","Marks Pod for deletion and starts grace-period lifecycle."],["kubelet","Runs applicable preStop hook, sends termination signal and coordinates shutdown."],["ReplicaSet controller","Notices replica shortfall and creates a replacement Pod."],["Scheduler + kubelet","Assign replacement to node and create its sandbox, network, mounts and containers."],["EndpointSlice + Service","Old endpoint is withdrawn as conditions change; replacement enters traffic when Ready."]]}
];

function Flow({items}:{items:string[]}){return <div className="mission-flow">{items.map((s,i)=><div className="mission-flow-step" key={s}><span>{String(i+1).padStart(2,"0")}</span><strong>{s}</strong>{i!==items.length-1&&<b aria-hidden="true">↓</b>}</div>)}</div>}

export default function KubernetesArchitecturePage(){
 const [tab,setTab]=useState("runtime"),[op,setOp]=useState("apply");
 const selected=tabs.find(t=>t.id===tab)!;const operation=operations.find(o=>o.id===op)!;
 return <main className="detail" style={{maxWidth:1320}}>
 <Link href="/" className="back">← ALL MISSIONS</Link>
 <div className="eyebrow">ARCHITECTURE FIELD GUIDE / MISSION 008.5 · DEEP DIVE</div>
 <h1 style={{fontSize:"clamp(38px,5vw,66px)"}}>How Kubernetes actually runs your application</h1>
 <p className="mission-lead">From YAML to Linux process, from PVC to mounted disk, and from DNS lookup to a packet reaching the right Pod. No acronym left unexplained.</p>
 <div className="actions"><a className="btn" href="/diagrams/kubernetes-control-plane-data-plane.excalidraw" download>Download editable Excalidraw ↗</a><a className="outline" href="https://github.com/bapuoldtown/production-engineering-warfare/tree/main/labs/008-kubernetes-network-warfare/diagrams" target="_blank" rel="noreferrer">GitHub source ↗</a></div>
 <section className="mission-panel"><h2>1. The complete cluster: four connected systems</h2><p>Read the diagram in layers: control-plane reconciliation, node execution, storage attachment/mounting, and Service discovery/forwarding. A Pod is the scheduling unit; its containers share a network namespace and can share volumes, but each container has its own process and filesystem view.</p><div style={{overflowX:"auto",border:"1px solid #cfe4dc",borderRadius:14,background:"#f8fcfa",padding:10}}><img src="/diagrams/kubernetes-control-plane-data-plane.svg" alt="Detailed Kubernetes architecture showing CRI, containerd, OCI runtime, CNI, CSI, PV/PVC, Services, EndpointSlices, CoreDNS, kube-proxy and StatefulSets" style={{display:"block",width:"100%",minWidth:980,height:"auto"}}/></div><p style={{fontSize:13}}>Solid arrows show execution/data flow. Dashed arrows show API watches and reconciliation. The drawing is a conceptual architecture; actual component placement and plugin implementations vary by distribution.</p></section>
 <section className="mission-panel"><h2>2. Follow one subsystem at a time</h2><p>Choose a path. Each step says who calls whom, what it does and what it does not do.</p><div className="mission-tabs">{tabs.map(t=><button key={t.id} className={tab===t.id?"selected":""} onClick={()=>setTab(t.id)}>{t.label}</button>)}</div><h3>{selected.intro}</h3><ol style={{paddingLeft:24}}>{selected.items.map((item,i)=><li key={item[0]} style={{padding:"0 0 20px 8px",color:"#087f73"}}><strong style={{color:"#17343c",fontSize:17}}>{item[0]}</strong><p style={{color:"#49666d",margin:"5px 0",lineHeight:1.75}}>{item[1]}</p></li>)}</ol></section>
 <section className="mission-panel"><h2>3. The runtime stack — do not mix up the interfaces</h2><Flow items={["kubelet (node agent)","CRI = gRPC contract","containerd CRI plugin","containerd daemon: images, snapshots, containers, tasks","containerd-shim-runc-v2 (common shim)","runc / OCI runtime","Linux kernel: namespaces + cgroups + mounts + capabilities","application process"]}/><div className="about-grid" style={{marginTop:24}}><div><span>CRI · CONTAINER RUNTIME INTERFACE</span><h3>Kubelet ↔ runtime</h3><p>A gRPC API contract. Kubelet uses RuntimeService for Pod sandboxes and containers, and ImageService for image operations. CRI is not a runtime itself.</p></div><div><span>CNI · CONTAINER NETWORK INTERFACE</span><h3>Runtime ↔ network plugin</h3><p>Plugin contract for configuring a Pod network sandbox. It is invoked as part of sandbox networking. It does not pull images or create the application process.</p></div><div><span>CSI · CONTAINER STORAGE INTERFACE</span><h3>Kubelet / attach controllers ↔ storage driver</h3><p>Plugin contract for provisioning, attaching, staging and publishing storage. It is not a container runtime interface and does not create a container.</p></div><div><span>OCI · OPEN CONTAINER INITIATIVE</span><h3>Runtime ↔ low-level runtime</h3><p>Image and runtime specifications. containerd commonly delegates process setup to runc through a shim. runc configures kernel isolation and starts the process; it is not Kubernetes' scheduler.</p></div></div><div className="mission-note"><strong>Important correction:</strong> containerd does not create a miniature virtual machine for every Pod. It creates container tasks using Linux kernel isolation primitives. A Pod is a logical grouping with shared namespaces and coordinated lifecycle; the kernel runs the processes.</div></section>
 <section className="mission-panel"><h2>4. Persistent storage: the full object chain</h2><Flow items={["Pod declares a PVC reference","PVC requests size + access mode + StorageClass","StorageClass selects provisioner and parameters","CSI external-provisioner asks CSI controller to CreateVolume","PV represents the provisioned storage; PVC binds to PV","Attach if required: CSI ControllerPublishVolume","Kubelet + CSI node plugin: NodeStageVolume (if supported)","NodePublishVolume mounts into Pod volume path","volumeMount exposes path inside the application container"]}/><p><strong>Vocabulary:</strong> a Volume is the Pod-facing mount abstraction; PVC is a namespaced request; PV is the cluster storage resource; StorageClass describes how dynamic storage is provisioned; CSI is the driver interface. The storage backend may be cloud block storage, network file storage, local disk or another supported system.</p><p>Ephemeral volumes generally follow Pod lifetime. Persistent volumes outlive individual Pods. A container restart does not erase a mounted persistent volume. A Pod replacement may reattach the claim, but topology, access modes, detach delays and storage health matter.</p></section>
 <section className="mission-panel"><h2>5. Service traffic: DNS, EndpointSlice and kube-proxy</h2><Flow items={["Client Pod asks DNS: api.payments.svc.cluster.local","CoreDNS resolves Service name → ClusterIP","Client opens TCP connection to ClusterIP:port","kube-proxy rules OR Cilium eBPF Service datapath intercepts VIP","Dataplane selects a backend from EndpointSlice","Packet routes to Pod IP:targetPort via node/pod network","Application container receives the connection"]}/><div className="about-grid" style={{marginTop:24}}><div><span>DISCOVERY</span><h3>CoreDNS</h3><p>Answers DNS questions using Kubernetes Service and endpoint data. DNS returns names/IPs; it does not forward the application packets.</p></div><div><span>BACKEND INVENTORY</span><h3>EndpointSlice</h3><p>Control-plane API objects listing endpoint addresses, ports and conditions for a Service. They are not a load balancer or proxy.</p></div><div><span>SERVICE VIRTUAL IP</span><h3>ClusterIP</h3><p>Stable virtual address for a Service. It can remain stable while Pod IPs change. The dataplane implements forwarding to endpoints.</p></div><div><span>NODE DATAPLANE</span><h3>kube-proxy / Cilium</h3><p>kube-proxy watches Services and EndpointSlices and programs node rules. Cilium can replace kube-proxy with eBPF when kube-proxy replacement is configured.</p></div></div><div className="mission-note"><strong>Do not conflate these:</strong> CoreDNS answers “where is the Service?”; EndpointSlice says “which backends exist?”; kube-proxy/Cilium says “how does this packet reach a backend?”; CNI supplies Pod connectivity and policy enforcement.</div></section>
 <section className="mission-panel"><h2>6. StatefulSet: stable name + stable storage per replica</h2><p>Example: a three-member database cluster. StatefulSet is not a database replication engine. It gives each replica a stable ordinal identity and claim mapping.</p><pre><code>{`StatefulSet: ledger
Headless Service: ledger
Pods: ledger-0, ledger-1, ledger-2

DNS:
ledger-0.ledger.default.svc.cluster.local
ledger-1.ledger.default.svc.cluster.local
ledger-2.ledger.default.svc.cluster.local

PVCs:
data-ledger-0 → PV A → storage volume A
data-ledger-1 → PV B → storage volume B
data-ledger-2 → PV C → storage volume C`}</code></pre><p>Headless Service has <code>clusterIP: None</code>; DNS can return Pod endpoint addresses. The StatefulSet's <code>volumeClaimTemplates</code> creates a separate PVC for each ordinal. If <code>ledger-1</code> is rescheduled, it can recover its own claim if the volume can be mounted on the new node.</p><p>StatefulSet does not guarantee quorum, replication correctness, fencing, backups or data consistency. PostgreSQL, Kafka or another stateful application must implement those semantics itself.</p></section>
 <section className="mission-panel"><h2>7. Watch Kubernetes execute commands</h2><p>Pick an operation and identify which components are activated. Notice how a Pod replacement triggers runtime, CNI, CSI and endpoint updates.</p><div className="mission-tabs">{operations.map(o=><button key={o.id} className={op===o.id?"selected":""} onClick={()=>setOp(o.id)}>{o.label}</button>)}</div><pre><code>{operation.command}</code></pre><ol style={{paddingLeft:24}}>{operation.steps.map(s=><li key={s[0]} style={{paddingBottom:14,color:"#087f73"}}><strong style={{color:"#17343c"}}>{s[0]}</strong><p style={{color:"#49666d",margin:"4px 0"}}>{s[1]}</p></li>)}</ol></section>
 <section className="mission-panel"><h2>8. Inspect your kind cluster — evidence, not assumptions</h2><p>Use these read-only commands first. Namespace names below are examples; substitute the namespace where your workload is deployed.</p><pre><code>{`# Node runtime and node details
kubectl --context kind-prod-sim get nodes -o wide
kubectl --context kind-prod-sim describe node kind-prod-sim-worker

# CRI: containerd containers and sandboxes (run on the node)
crictl info
crictl pods
crictl ps -a

# CNI / Cilium and kube-proxy mode
kubectl --context kind-prod-sim -n kube-system get pods -o wide
kubectl --context kind-prod-sim -n kube-system get ds kube-proxy
kubectl --context kind-prod-sim -n kube-system get cm cilium-config -o yaml

# Storage chain
kubectl --context kind-prod-sim get sc
kubectl --context kind-prod-sim get pv
kubectl --context kind-prod-sim get pvc -A
kubectl --context kind-prod-sim get csidrivers
kubectl --context kind-prod-sim get csinodes

# Services, DNS, EndpointSlices
kubectl --context kind-prod-sim get svc -A
kubectl --context kind-prod-sim get endpointslices -A
kubectl --context kind-prod-sim -n kube-system get pods -l k8s-app=kube-dns

# Stateful workloads
kubectl --context kind-prod-sim get statefulsets,pods,pvc -A -o wide`}</code></pre><p>Note: <code>crictl</code> must run where the node's CRI socket is accessible. With kind, that usually means entering the node container first. These commands are inspection steps, not instructions to mutate the cluster.</p></section>
 <section className="mission-note"><strong>Our teaching rule:</strong> every acronym gets expanded, every component gets an owner, every arrow gets a direction, and every failure gets observable evidence. You are learning to reason about a production system—not memorising interview flashcards.</section>
 <p style={{color:"#557078"}}>Next lab: deploy a stateful database plus stateless API, provision a PVC, expose the API through ClusterIP, inspect CoreDNS and EndpointSlices, then break storage, readiness and Service routing one fault at a time.</p>
 <Link href="/" className="back">← BACK TO FIELD MANUAL</Link>
 </main>;
}
