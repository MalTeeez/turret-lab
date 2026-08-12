<footer class="mt-[26px] border-t border-line pt-3.5 text-[11px] text-dim [&_code]:bg-panel2 [&_code]:px-1 [&_code]:text-ink">
  Values are peak effective DPS divided by turret slots, at the point-blank end of each weapon's
  envelope; the charts show decay across range. Every figure sums the turret's real barrel assembly
  from <code>turretgenerator.lua</code> — Predator ×6 (asymmetric: barrel 1 uses <code>600+t</code>,
  the rest <code>20+t</code>), Proton ×7, Gatling ×5, Clandatoh / Interceptor / A.D.S.T. ×4, Ophidian
  3×SW + 1×CW (the central barrel carries hull ×15), Triad / Flamethrower ×3, APCR ×2 (the generator
  re-adds its weapon without clearing). Flight-time penalty is modelled as <code>1/(1+t)</code> —
  beams and seekers take none. Duty cycle uses each turret's real
  <code>shootingTime/(shootingTime+coolingTime)</code>; the Pulse Shotgun pre-compensates its own duty
  in code, and the Flamethrower's is rolled per turret (10–45&nbsp;s shooting / 17.5–43.75&nbsp;s
  cooling). Factory investment applies <code>stat × (1 + ΣinvestFactor)</code>. Enemy resistance is
  <code>Shield:setResistance</code> — shield-only, ~95%, one of Physical / Plasma / Electric /
  AntiMatter on ~half of ships at Normal; hull damage and all Energy / Fragments weapons are immune.
  Slot classes follow <code>weapontype.lua</code>: Salvaging / Mining / Hammer Heads are
  <b class="text-ink">Unarmed</b>, A.D.S.T. / Anti-Fighter / Torpedo are
  <b class="text-ink">Defense</b>. The HET Salvaging Laser calls <code>adaptWeapon</code> (full
  ×(1+0.4·rarity)), not the mining ×1.05 path, on a <code>fireDelay</code> of 0.02 — a genuine
  outlier, but it rides free on unarmed slots. Clandatoh range is capped by projectile lifetime
  (<code>pmaximumTime</code> is never rescaled), so its card range overstates reality. Flamethrower
  shield penetration at Exceptional is 0.8. Budget constant fitted to 0.4439 against in-game cards
  (tech 36: Ophidian, Predator ×3 rarities, Clandatoh, Flamethrower, Salvaging ×2); difficulty does
  not scale turret stats; sector ship volume uses the mod's override of
  <code>Balancing_GetSectorShipVolume</code>. The game's own per-type eDPS card lines are built from
  the first weapon only and can misreport multi-barrel turrets — trust the Raw DPS field.
</footer>
