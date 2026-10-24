/**
 * The moon, its size to the globe's scale but its orbit much nearer than
 * the real one's, which would leave it a dot in the sky. It moves out and
 * grows as the globe zooms. It goes round every few minutes rather than
 * every 27 days, near side always to the globe, lit by a fixed sun so it
 * shows its phases. Its map is NASA's (SVS
 * 4720, from the Lunar Reconnaissance Orbiter; public domain).
 */
import { Matrix4, Mesh, ShaderMaterial, SphereGeometry, SRGBColorSpace, TextureLoader, Vector3 } from "three"
import url from "../assets/moon.jpg"

/** NASA's Moon fact sheet: mean radius 1737.4 km, mean distance 384,400 km; the Earth's 6371 km. */
const RADIUS_RATIO = 1737.4 / 6371
/** An eighth of the real distance, so from the globe it looks eight times the real moon's size. */
const DISTANCE_RATIO = 384_400 / 6371 / 8
const ORBIT_S = 300
/** About the real orbit's tilt to the Earth's equator. */
const INCLINATION = (23 * Math.PI) / 180
/** Where the sunlight comes from: across the room, a little above. */
const SUN = new Vector3(1, 0.25, -0.4).normalize()

const normal = new Vector3(0, 1, 0).applyAxisAngle(new Vector3(1, 0, 0), INCLINATION)
const start = new Vector3(0, 0, -1).applyAxisAngle(new Vector3(1, 0, 0), INCLINATION)
const at = new Vector3()
const x = new Vector3()
const y = new Vector3()
const z = new Vector3()
const basis = new Matrix4()

export class Moon {
  readonly mesh: Mesh<SphereGeometry, ShaderMaterial>
  private angle = 0

  constructor() {
    const map = new TextureLoader().load(url)
    map.colorSpace = SRGBColorSpace
    this.mesh = new Mesh(
      new SphereGeometry(1, 64, 32),
      new ShaderMaterial({
        uniforms: { map: { value: map }, sun: { value: SUN } },
        vertexShader: `
          varying vec2 vUv;
          varying vec3 vNormal;
          void main() {
            vUv = uv;
            vNormal = normalize(mat3(modelMatrix) * normal);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: `
          uniform sampler2D map;
          uniform vec3 sun;
          varying vec2 vUv;
          varying vec3 vNormal;
          void main() {
            // A soft terminator, bright against the black, and a little earthshine on the dark side.
            float light = 1.6 * smoothstep(-0.05, 0.25, dot(normalize(vNormal), sun)) + 0.03;
            gl_FragColor = vec4(texture2D(map, vUv).rgb * light, 1.0);
            #include <colorspace_fragment>
          }`
      })
    )
  }

  /** Round the globe at `centre`, of radius `radius` in metres, `dt` seconds on. */
  update(dt: number, centre: Vector3, radius: number): void {
    this.angle = (this.angle + (dt / ORBIT_S) * Math.PI * 2) % (Math.PI * 2)
    at.copy(start).applyAxisAngle(normal, this.angle)
    this.mesh.position.copy(centre).addScaledVector(at, radius * DISTANCE_RATIO)
    this.mesh.scale.setScalar(radius * RADIUS_RATIO)
    // Longitude 0, the near side's middle, to the globe; north along the orbit's axis.
    x.copy(at).negate()
    z.crossVectors(x, normal).normalize()
    y.crossVectors(z, x)
    this.mesh.quaternion.setFromRotationMatrix(basis.makeBasis(x, y, z))
  }
}
