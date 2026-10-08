---
name: unity-dice-physics
description: Master 3D Rigidbody Physics, BoxCollider Collision, PhysicMaterial Bounciness & Face Detection Agent for Unity Ludo.
---

# 🎲 Unity 3D Dice Physics Agent

## Physics Specifications

### 1. Rigidbody & Collision Mechanics
- Use Unity standard `Rigidbody` with interpolated movement (`Interpolate`) and continuous collision detection (`ContinuousSpeculative`) to completely prevent tunnel clipping through tabletop colliders.
- Table surface has a custom `PhysicMaterial` with dynamic friction `0.45`, static friction `0.55`, bounciness `0.35`, and bounce combine mode `Average`.
- Dice have mass `0.06 kg`, drag `0.4`, and angular drag `0.8` for natural heirloom brass/resin weight.

### 2. Chaotic Toss & Torque Impulse
- Apply randomized upward and lateral linear impulses:
  ```csharp
  rb.velocity = new Vector3(Random.Range(-1.2f, 1.2f), Random.Range(4.5f, 5.8f), Random.Range(-1.0f, 1.0f));
  rb.angularVelocity = Random.insideUnitSphere * Random.Range(20f, 32f);
  ```

### 3. Face-Up Normal Vector Evaluation
- Read the top face mathematically using Vector3 dot products against `Vector3.up`:
  ```csharp
  Vector3[] faceNormals = {
      transform.up,       // Face 1
      -transform.forward, // Face 2
      transform.right,    // Face 3
      -transform.right,   // Face 4
      transform.forward,  // Face 5
      -transform.up       // Face 6
  };
  int[] faceValues = { 1, 2, 3, 4, 5, 6 };
  // Find index of maximum Vector3.Dot(faceNormal, Vector3.up)
  ```
- Trigger tactile audio tick on collision impact using `OnCollisionEnter` with impulse magnitude volume scaling.
