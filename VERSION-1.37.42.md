# JamdDmaj AI v1.37.42

- Adds a simulation-only A/B experiment that compares the current executor baseline against the AI-recommended stricter variant.
- The AI variant evaluates unique 5-minute candidates, 4h trend alignment, volume expansion, entry drift, counter-market confirmation, spread, ADX, and weak-category history.
- Tracks distinct candidates and matched outcomes without sending orders or changing the live execution path.
- Shows baseline-versus-AI candidates, wins, losses, win rate, and the main experimental rejection in the Pro dashboard and daily Telegram learning report.
- Adds a historical confirmation study for stronger volume and ADX so the recommendation can be measured before adoption.
- Automatically compares recent winning and losing cohorts by score, volume, ADX, and counter-market exposure.
- Labels dry-run entries as simulated entries and explicitly confirms that no real order was sent.
