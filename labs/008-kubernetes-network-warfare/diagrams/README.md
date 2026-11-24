# Kubernetes Control Plane & Data Plane Diagram

Editable Excalidraw source: [kubernetes-control-plane-data-plane.excalidraw](kubernetes-control-plane-data-plane.excalidraw).

Open it at https://excalidraw.com and choose Open to import the file. The SVG preview used by the learning portal is published under `web/public/diagrams/`.

Conceptual teaching view: controllers reconcile by watching/updating API objects through the API server; scheduler binds unscheduled Pods; kubelet on each selected node coordinates the runtime; runtime networking invokes CNI; Service forwarding uses kube-proxy or a CNI replacement depending on cluster configuration.
