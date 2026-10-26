import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { day } from './project.js';

export class Viewer {
  constructor(container,onSelect){
    this.container=container;this.onSelect=onSelect;this.meshes=[];this.project=null;this.selected=null;
    this.scene=new THREE.Scene();this.scene.background=new THREE.Color('#edf1f2');
    this.camera=new THREE.PerspectiveCamera(38,1,.01,10000);this.camera.position.set(31,25,33);
    this.renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,2));this.renderer.outputColorSpace=THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled=true;container.append(this.renderer.domElement);
    this.controls=new OrbitControls(this.camera,this.renderer.domElement);this.controls.enableDamping=true;this.controls.target.set(0,4,0);
    this.scene.add(new THREE.HemisphereLight(0xffffff,0x8c9ba5,2.8));
    const sun=new THREE.DirectionalLight(0xffffff,3);sun.position.set(18,30,16);this.scene.add(sun);
    const grid=new THREE.GridHelper(80,40,0xc5cfd1,0xdde3e4);grid.position.y=-1;this.scene.add(grid);
    this.group=new THREE.Group();this.scene.add(this.group);
    this.raycaster=new THREE.Raycaster();this.pointer=new THREE.Vector2();
    let down;
    this.renderer.domElement.addEventListener('pointerdown',e=>{down={x:e.clientX,y:e.clientY};});
    this.renderer.domElement.addEventListener('pointerup',e=>{
      if(!down||Math.hypot(e.clientX-down.x,e.clientY-down.y)>5)return;
      const r=this.renderer.domElement.getBoundingClientRect();this.pointer.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);this.raycaster.setFromCamera(this.pointer,this.camera);
      const hit=this.raycaster.intersectObjects(this.meshes.filter(m=>m.visible),false)[0];if(hit)this.onSelect(hit.object.userData.partId);
    });
    new ResizeObserver(()=>this.resize()).observe(container);
    this.renderer.setAnimationLoop(()=>{this.controls.update();this.renderer.render(this.scene,this.camera);});
    this.resize();
  }
  resize(){const w=this.container.clientWidth,h=this.container.clientHeight;if(!w||!h)return;this.camera.aspect=w/h;this.camera.updateProjectionMatrix();this.renderer.setSize(w,h);}
  clear(){
    const geometries=new Set(),materials=new Set();this.group.traverse(o=>{if(o.isMesh){geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);}});
    for(const g of geometries)g.dispose();for(const m of materials){for(const v of Object.values(m))if(v?.isTexture)v.dispose();m.dispose();}
    this.group.clear();this.meshes=[];
  }
  async parseGlb(data){
    const bytes=typeof data==='string'?Uint8Array.from(atob(data.split(',')[1]),c=>c.charCodeAt(0)).buffer:data;
    const manager=new THREE.LoadingManager();manager.setURLModifier(url=>{if(url.startsWith('blob:')||url.startsWith('data:'))return url;throw new Error('GLB must embed its textures and buffers. External resources are not loaded.');});
    return new GLTFLoader(manager).parseAsync(bytes,'');
  }
  async load(project){
    const generation=(this.generation??0)+1;this.generation=generation;
    const gltf=project.modelAsset?await this.parseGlb(project.modelAsset):null;
    if(this.generation!==generation)return;
    this.clear();this.project=project;
    if(gltf){
      let i=0;
      gltf.scene.traverse(o=>{if(o.isMesh){o.userData.partId=`mesh-${i++}`;o.material=new THREE.MeshStandardMaterial({color:0x9eafb5,roughness:.7});this.meshes.push(o);}});
      this.group.add(gltf.scene);
    }else for(const p of project.parts){
      const m=new THREE.Mesh(new THREE.BoxGeometry(...p.size),new THREE.MeshStandardMaterial({color:0xa7b6ba,roughness:.65,metalness:.05}));
      m.position.set(...p.position);m.userData.partId=p.id;this.group.add(m);this.meshes.push(m);
    }
    this.fit();
  }
  fit(mode='iso'){
    const box=new THREE.Box3().setFromObject(this.group);if(box.isEmpty())return;
    const center=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3()),radius=Math.max(size.x,size.y,size.z,5)*1.15;
    this.controls.target.copy(center);
    this.camera.position.copy(center).add(mode==='top'?new THREE.Vector3(0,radius,.001):mode==='front'?new THREE.Vector3(0,radius*.08,radius):new THREE.Vector3(radius,radius*.75,radius));
    this.camera.near=Math.max(.01,radius/1000);this.camera.far=radius*100;this.camera.updateProjectionMatrix();this.controls.update();
  }
  update(project,at,selected,{hideFuture=false,wireframe=false,actual=false}={}){
    this.project=project;const tasks=new Map(project.tasks.map(t=>[t.id,t])),parts=new Map(project.parts.map(p=>[p.id,p]));
    for(const mesh of this.meshes){
      const p=parts.get(mesh.userData.partId),t=tasks.get(p?.taskId);let color='#a9b9c1',opacity=.22;
      if(t){const future=at<day(t.start),complete=actual?t.progress>=100:at>=day(t.finish),active=actual?t.progress>0&&!complete:!future&&!complete;
        color=complete?'#36a99a':active?'#efad51':'#a9b9c1';opacity=complete||active?1:.16;mesh.visible=!(hideFuture&&(actual?t.progress===0:future));
      }else mesh.visible=true;
      if(selected===mesh.userData.partId||selected===p?.taskId){color='#447ceb';opacity=1;}
      mesh.material.color.set(color);mesh.material.opacity=opacity;mesh.material.transparent=opacity<1;mesh.material.depthWrite=opacity>=1;mesh.material.wireframe=wireframe;
    }
  }
  overlaps(project,at){
    const tasks=new Map(project.tasks.map(t=>[t.id,t]));const active=this.meshes.filter(m=>{const part=project.parts.find(p=>p.id===m.userData.partId),t=tasks.get(part?.taskId);return t&&at>=day(t.start)&&at<day(t.finish);});
    if(active.length>1000)throw new Error('Overlap screening is limited to 1,000 active parts.');
    this.group.updateMatrixWorld(true);const boxes=active.map(m=>new THREE.Box3().setFromObject(m)),hits=[];
    for(let i=0;i<active.length;i++)for(let j=i+1;j<active.length;j++)if(boxes[i].intersectsBox(boxes[j])){
      const overlap=boxes[i].clone().intersect(boxes[j]).getSize(new THREE.Vector3());
      if(Math.min(overlap.x,overlap.y,overlap.z)>.005)hits.push([active[i].userData.partId,active[j].userData.partId]);
    }
    return hits;
  }
  screenshot(){return this.renderer.domElement.toDataURL('image/png');}
}
