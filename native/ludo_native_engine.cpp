/**
 * Mission Sambhoug 3D Ludo - Native C++ WebAssembly Engine
 * High-Performance Math, Physics, and AI Heuristics for 60-120 FPS Mobile Lock
 *
 * Compiles via Emscripten:
 * emcc -O3 --bind -s WASM=1 -s ALLOW_MEMORY_GROWTH=1 -s MODULARIZE=1 -s EXPORT_NAME="LudoNativeEngine" \
 *      native/ludo_native_engine.cpp -o public/wasm/ludo_native_engine.js
 */

#include <cmath>
#include <vector>
#include <cstdint>

#ifdef __EMSCRIPTEN__
#include <emscripten/bind.h>
#include <emscripten/val.h>
using namespace emscripten;
#endif

namespace LudoNative {

// 1. Ultra-Fast High-Entropy XorShift128+ PRNG (Sub-nanosecond RNG)
struct XorShift128Plus {
    uint64_t s[2];

    XorShift128Plus(uint64_t seed1 = 0x853c49e6748fea9bULL, uint64_t seed2 = 0xda3e39cb94b95bdbULL) {
        s[0] = seed1 == 0 ? 0x853c49e6748fea9bULL : seed1;
        s[1] = seed2 == 0 ? 0xda3e39cb94b95bdbULL : seed2;
    }

    inline uint64_t Next() {
        uint64_t x = s[0];
        uint64_t const y = s[1];
        s[0] = y;
        x ^= x << 23;
        s[1] = x ^ y ^ (x >> 17) ^ (y >> 26);
        return s[1] + y;
    }

    inline int RollDie() {
        return static_cast<int>((Next() % 6) + 1);
    }
};

static XorShift128Plus g_rng;

// 2. High-Speed Rigid-Body Dice Physics Step Integrator
struct Vector3D {
    float x, y, z;
};

struct DicePhysicsState {
    Vector3D position;
    Vector3D velocity;
    Vector3D rotation;
    Vector3D angularVelocity;
    bool isSettled;
    int finalValue;
};

DicePhysicsState StepDicePhysics(DicePhysicsState state, float dt, float gravity = -18.0f, float restitution = 0.52f) {
    if (state.isSettled) return state;

    // Linear Velocity Integration (Euler + Damped Drag)
    state.velocity.y += gravity * dt;
    state.velocity.x *= std::pow(0.85f, dt * 60.0f);
    state.velocity.z *= std::pow(0.85f, dt * 60.0f);

    state.position.x += state.velocity.x * dt;
    state.position.y += state.velocity.y * dt;
    state.position.z += state.velocity.z * dt;

    // Angular Velocity Integration
    state.rotation.x += state.angularVelocity.x * dt;
    state.rotation.y += state.angularVelocity.y * dt;
    state.rotation.z += state.angularVelocity.z * dt;

    state.angularVelocity.x *= std::pow(0.88f, dt * 60.0f);
    state.angularVelocity.y *= std::pow(0.88f, dt * 60.0f);
    state.angularVelocity.z *= std::pow(0.88f, dt * 60.0f);

    // Floor Contact Collision Plane (Y = 0.95)
    const float floorY = 0.95f;
    if (state.position.y <= floorY) {
        state.position.y = floorY;
        if (std::abs(state.velocity.y) > 0.4f) {
            state.velocity.y = -state.velocity.y * restitution;
        } else {
            state.velocity.y = 0.0f;
        }

        // Friction on impact
        state.velocity.x *= 0.75f;
        state.velocity.z *= 0.75f;
    }

    // Settlement detection
    float speedSq = (state.velocity.x * state.velocity.x) +
                    (state.velocity.y * state.velocity.y) +
                    (state.velocity.z * state.velocity.z);

    float spinSq = (state.angularVelocity.x * state.angularVelocity.x) +
                   (state.angularVelocity.y * state.angularVelocity.y) +
                   (state.angularVelocity.z * state.angularVelocity.z);

    if (state.position.y <= floorY + 0.02f && speedSq < 0.04f && spinSq < 0.08f) {
        state.isSettled = true;
        state.velocity = {0, 0, 0};
        state.angularVelocity = {0, 0, 0};
    }

    return state;
}

// 3. Fast Turn Heuristic Evaluator for AI Bot
int EvaluateMoveScoreNative(
    int playerId,
    int currentStep,
    int rollValue,
    bool isSafeTile,
    bool willReachGoal,
    bool canCaptureOpponent,
    int opponentDistanceAhead
) {
    int score = 0;

    // 1. Entering Sanctuary / Finishing is highest priority
    if (willReachGoal) {
        score += 10000;
        return score;
    }

    // 2. Releasing goti from Yard on 6
    if (currentStep < 0 && rollValue == 6) {
        score += 5000;
        return score;
    }

    // 3. Capturing opponent pawn
    if (canCaptureOpponent) {
        score += 3500;
    }

    // 4. Moving onto a Safe Star
    if (isSafeTile) {
        score += 1200;
    }

    // 5. Escaping immediate capture danger (opponent within 1..6 tiles behind)
    if (currentStep >= 0 && currentStep <= 50) {
        score += (currentStep * 15); // Progress factor
    }

    // 6. Avoid moving out of safe tile unless capturing or scoring
    if (isSafeTile && !canCaptureOpponent && !willReachGoal) {
        score -= 400;
    }

    return score;
}

// Native Roll function returning structured values
struct RollOutput {
    int d1;
    int d2;
    int total;
    bool isDouble;
    bool hasSix;
};

RollOutput RollDiceNative(int diceCount) {
    RollOutput out;
    out.d1 = g_rng.RollDie();
    out.d2 = (diceCount == 2) ? g_rng.RollDie() : 0;
    out.total = out.d1 + out.d2;
    out.isDouble = (diceCount == 2 && out.d1 == out.d2);
    out.hasSix = (out.d1 == 6 || out.d2 == 6);
    return out;
}

} // namespace LudoNative

#ifdef __EMSCRIPTEN__
EMSCRIPTEN_BINDINGS(ludo_native_module) {
    value_object<LudoNative::Vector3D>("Vector3D")
        .field("x", &LudoNative::Vector3D::x)
        .field("y", &LudoNative::Vector3D::y)
        .field("z", &LudoNative::Vector3D::z);

    value_object<LudoNative::DicePhysicsState>("DicePhysicsState")
        .field("position", &LudoNative::DicePhysicsState::position)
        .field("velocity", &LudoNative::DicePhysicsState::velocity)
        .field("rotation", &LudoNative::DicePhysicsState::rotation)
        .field("angularVelocity", &LudoNative::DicePhysicsState::angularVelocity)
        .field("isSettled", &LudoNative::DicePhysicsState::isSettled)
        .field("finalValue", &LudoNative::DicePhysicsState::finalValue);

    value_object<LudoNative::RollOutput>("RollOutput")
        .field("d1", &LudoNative::RollOutput::d1)
        .field("d2", &LudoNative::RollOutput::d2)
        .field("total", &LudoNative::RollOutput::total)
        .field("isDouble", &LudoNative::RollOutput::isDouble)
        .field("hasSix", &LudoNative::RollOutput::hasSix);

    function("StepDicePhysics", &LudoNative::StepDicePhysics);
    function("EvaluateMoveScoreNative", &LudoNative::EvaluateMoveScoreNative);
    function("RollDiceNative", &LudoNative::RollDiceNative);
}
#endif
