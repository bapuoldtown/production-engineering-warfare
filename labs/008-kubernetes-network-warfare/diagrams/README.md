# Kubernetes Control Plane & Data Plane Diagram

Editable Excalidraw source: [kubernetes-control-plane-data-plane.excalidraw](kubernetes-control-plane-data-plane.excalidraw).

Open it at https://excalidraw.com and choose Open to import the file. The SVG preview used by the learning portal is published under `web/public/diagrams/`.

Conceptual teaching view: controllers reconcile by watching/updating API objects through the API server; scheduler binds unscheduled Pods; kubelet on each selected node coordinates the runtime; runtime networking invokes CNI; Service forwarding uses kube-proxy or a CNI replacement depending on cluster configuration.


## Expanded architecture coverage

The latest diagram and Vercel explorer now cover:

- CRI gRPC: kubelet to container runtime; containerd CRI plugin, Pod sandbox/pause container, image service, containerd-shim and OCI runtime/runc, Linux namespaces and cgroups.
- CNI: Pod network namespace setup, interface/IP/routes and dataplane plugin responsibilities.
- CSI: StorageClass, PVC/PV binding, dynamic provisioning sidecars, CSI controller and node plugin, optional attach/stage and publish/mount flow.
- Services: CoreDNS name resolution, ClusterIP virtual IP, EndpointSlices, kube-proxy or configured Cilium eBPF Service dataplane, and CNI Pod routing.
- StatefulSets: headless Service, stable per-ordinal DNS identity and a PVC/PV mapping per replica.

The teaching notes distinguish DNS discovery, endpoint inventory, packet forwarding and Pod connectivity as separate responsibilities.
