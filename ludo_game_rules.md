# Official Ludo Game Rules

Ludo is a strategy board game for 2 to 4 players, derived from the traditional Indian game *Pachisi*. Players race their four tokens from start to finish according to the rolls of a single die or two dice.

---

## 1. Overview & Components

- **Board:** Consists of four colored arms (Red, Green, Yellow, Blue) arranged in a cross, with a central Home Triangle. Each corner contains a colored Yard (Starting Area).
- **Tokens:** Each player controls four tokens of a single color.
- **Dice:** Standard 6-sided die (1 die for classic rules; 2 dice for the double-dice variant).
- **Objective:** Be the first player to navigate all four tokens around the track, up their colored Home Column, and safely into the central Home Triangle.

---

## 2. Core Mechanics (Common to Both Modes)

### Entering the Track
- Tokens start inside their respective Yard.
- A player must roll a **6** (or qualifying roll in 2-dice mode) to move a token from the Yard onto their starting square on the main track.

### Movement & Direction
- Tokens travel clockwise around the perimeter track.
- Movement must match the exact face value of the die.

### Capturing (Knocking Out)
- If a player's token lands on an opponent's token on a regular square, the opponent's token is **captured** and returned to its Yard.
- The captured token must wait for another qualifying roll to re-enter.
- **Capture Bonus:** Capturing an opponent's token grants the active player one free bonus roll (or turn).

### Safe Star Sanctuaries (No Elimination on Stars)
- **100% Star Immunity:** All 8 tiles marked with a **Celestial Gold Star** (the 4 player Starting Stars and the 4 Castle Stars) are absolute sanctuaries.
- **Zero Captures on Stars:** **NO player's goti can EVER be eliminated or captured on a star tile.**
- **Safe Co-existence:** When multiple gotiyan (friendly or opposing) land on the same star tile, they sit side-by-side safely. Passing or landing opponents cannot knock out any goti on a star.
- **Blocks (Doubles):** On regular (non-star) squares, two tokens of the same color form a block that cannot be passed or captured. Safe stars never form blocking walls.

### Entering Home
- Once a token completes the perimeter lap, it turns into its color-matched **Home Column**.
- Opponents cannot enter other players' Home Columns.
- Reaching the central Home Triangle requires an **exact roll**.

---

## 3. Classic Rules: Playing with One (1) Die

### Turn Sequence
1. Players roll the single die in clockwise rotation.
2. If no tokens are active on the track and the player does not roll a **6**, their turn immediately passes.

### The Rule of Six (6)
- Rolling a **6** allows a player to:
  - Bring a new token from the Yard onto the Start square, **OR**
  - Advance an existing active token 6 squares forward.
- **Bonus Roll:** Rolling a 6 always grants an additional roll.
- **Three-Sixes Penalty:** Rolling three consecutive sixes forfeits the turn, and any movement made during that turn is voided (or the token returns to its prior position).

---

## 4. Accelerated Rules: Playing with Two (2) Dice

Playing with two dice speeds up the game, introduces strategic splits, and increases capture frequency.

### Turn Sequence & Distribution
1. The active player rolls both dice simultaneously.
2. The values shown on the two dice can be assigned in one of two ways:
   - **Combined Move:** Move a single token the total sum of both dice (e.g., rolling 3 and 5 allows one token to move 8 squares).
   - **Split Move:** Move two different tokens—one by the first die's value, the other by the second die's value.

### Entering the Track with Two Dice
A token can be released from the Yard if:
- **A Single 6:** At least one of the dice shows a 6 (the other die moves that token or another active token).
- **Double Sixes (6-6):** Allows the player to bring **two** tokens onto the start square simultaneously, or bring one out and advance it 6 spaces.
- **Sum of Six (Optional House Rule):** Some variants allow combinations adding up to 6 (e.g., 4+2 or 5+1) to release one token, though classic 2-dice rules strictly require an actual face value of 6.

### Official Bonus Turn Rules

#### 2-Dice Game Bonus Rule
A bonus round is granted **ONLY** when:
1. **Double Sixes (6+6):** Rolling 6 on both dice simultaneously (`6+6`). (Other doubles do NOT grant bonus rolls).
2. **Elimination / Knockout:** Capturing an opponent's token and sending it back to its yard.
3. **Reaching Home Base:** When any goti safely enters the central home sanctuary / completes its travel (step 56).
- **Three Consecutive 6+6 Penalty:** Rolling three consecutive double sixes forfeits the turn.

#### 1-Die Game Bonus Rule
A bonus round is granted **ONLY** when:
1. **Rolling a 6:** Rolling a 6 on the single die.
2. **Elimination / Knockout:** Capturing an opponent's token and sending it back to its yard.
3. **Reaching Home Base:** When any goti safely enters the central home sanctuary / completes its travel (step 56).
- **Three Consecutive Sixes Penalty:** Rolling three consecutive sixes forfeits the turn.

### Blocking & Capturing in Split Movement
- If using the **Combined Move** (e.g., 4 + 3 = 7), the token is considered to land on intermediate squares. If an opponent's block sits on square 4, the token cannot complete the combined move of 7 unless the obstacle is cleared.
- Individual captures can occur at the intermediate point if using a split move.

---

## 5. Summary Comparison

| Feature | 1-Die Rules | 2-Dice Rules |
| :--- | :--- | :--- |
| **Pace** | Slower, traditional pacing | Fast, strategic action |
| **Turn Options** | Single token movement | Combined move or split between two tokens |
| **Bonus Turn Trigger** | Only 6, Elimination, or Home | Only 6+6, Elimination, or Home |
| **Max Steps per Roll** | 6 squares | 12 squares (sum of 6 + 6) |
| **Starting Odds** | $1/6$ chance per turn | $11/36$ chance per turn (higher entry rate) |

---

## 6. Winning the Game

The first player to successfully move all 4 tokens into the central Home Triangle wins the match. Remaining players may continue playing to determine 2nd, 3rd, and 4th place.

---

## 7. Advanced Tournament & Digital Rules (Mission Sambhoug 3D Ludo)

1. **Roll-First Sequence (Complete All Rolls Upfront):**
   - If a roll triggers an immediate bonus roll (e.g. rolling a **6** in 1-Die mode, or rolling **Doubles** in 2-Dice mode), the player completes all consecutive rolling before moving any tokens.
   - All rolled numbers accumulate into the active turn pool. Once rolling finishes (or 3 consecutive sixes/doubles forfeits the turn), the player assigns and runs their tokens strategically using the complete set of rolled dice.
2. **Endgame Home Lane Single-Die Adaptation (2-Dice Mode):**
   - In a 2-Dice match, when a player has successfully brought 3 tokens into the Sanctuary Goal and has only **1 last token remaining** that has entered the **Home Lane** (Steps 51–55), the second die is automatically hidden and disabled. The player plays with **1 Die only** to complete the final stretch into the Home Triangle.
3. **Host-Controlled Match Mode:**
   - In Online Multiplayer matches, only the **Room Host** can configure or switch between 1 Die (Classic) and 2 Dice (Speed) mode before the match begins. Guests' controls automatically synchronize to the host's selected mode.
4. **Resilient Automatic Network Reconnection:**
   - The game continuously monitors network connectivity. If a connection drop or transient Wi-Fi/cellular interruption occurs, the client automatically re-establishes signaling and data channels, re-subscribes to the active room, and restores gameplay state seamlessly.
5. **20-Second Turn Auto-Play Timer:**
   - Active players have a **20-second countdown** per turn. If a player fails to roll their dice within 20 seconds, the game automatically executes the roll. If a player fails to select a token, the AI tactical bot automatically selects the optimal legal move, preventing AFK deadlocks.
6. **Smart Automatic Moves (Double Dice & Single Goti Automation):**
   - **Auto-Open & Run Combo (6 + X):** When all unfinished tokens are in the yard and the player rolls a 6 and another number (e.g. 6+1, 6+2, 6+3, 6+4, 6+5), the 6 automatically opens a token to the start square (Step 0) and the second die automatically advances that newly opened token by $X$ steps without requiring repetitive manual taps.
   - **Single Active Goti Auto-Turn:** If a player has only 1 active token on the track and rolls non-6 dice (meaning no yard token can be released), that single token automatically executes both dice sequentially.
   - **Final Goti Full-Turn Automation:** If 3 tokens have already reached Goal sanctuary and only 1 token remains in play, all rolled dice automatically advance that final token without unnecessary selection dialogs.
   - **Single Legal Move Quick-Advance:** Whenever only 1 token can legally move across the board (both in 2-Dice and 1-Die modes), the move executes automatically after a smooth 450ms visual pause.
7. **Absolute Star Sanctuary (Zero Eliminations on Stars):**
   - All 8 Star tiles (Indices 0, 8, 13, 21, 26, 34, 39, 47) are complete sanctuaries.
   - **No player can ever eliminate or capture an opponent's goti on ANY star tile.**
   - Multiple gotiyan peacefully rest together on the star tile with zero knockouts.
8. **Physical Clockwise Turn Rotation:**
   - Turns strictly follow the physical clockwise spatial layout around the board:
     1. **1st Turn:** **Red** (Top-Right)
     2. **2nd Turn:** **Charcoal** (Bottom-Right)
     3. **3rd Turn:** **Yellow** (Bottom-Left)
     4. **4th Turn:** **Blue** (Top-Left)
   - Rotation cycles continuously in this clockwise order throughout the match.