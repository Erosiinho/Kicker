<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center"
      @click.self="$emit('close')"
    >
      <div class="panel-turf w-full max-w-md" style="max-height: 85vh; overflow-y: auto">
        <div class="flex items-start justify-between gap-3">
          <div>
            <span class="field-label">How to play</span>
            <h2 class="brand-title text-2xl leading-none">Rules</h2>
          </div>
          <button class="btn btn-ghost btn-sm" aria-label="Close" @click="$emit('close')">✕</button>
        </div>

        <div class="flex flex-col gap-4 text-sm" style="color: var(--chalk-dim)">
          <section class="flex flex-col gap-1">
            <p class="field-label" style="color: var(--gold)">The puzzle</p>
            <p>
              Each round the server secretly picks a <strong style="color: var(--chalk)">Mystery Player</strong> and
              shows five other footballers — the "community cards" — who really played alongside them at some club
              or national team.
            </p>
          </section>

          <section class="flex flex-col gap-1">
            <p class="field-label" style="color: var(--gold)">Betting streets</p>
            <p>
              Pre-flop (1 card up), Flop (+2), Turn (+1), River (+1) — a check/call/raise/fold round between each
              stage, poker-style. All five community cards are up by the River.
            </p>
          </section>

          <section class="flex flex-col gap-1">
            <p class="field-label" style="color: var(--gold)">Your guess</p>
            <p>
              Submit — or change — your secret guess at any point once betting starts. It's never locked in until
              the reveal, and nobody else can see what you picked, only that you've picked something.
            </p>
          </section>

          <section class="flex flex-col gap-1">
            <p class="field-label" style="color: var(--gold)">Showdown & reveal</p>
            <p>
              Once every non-folded player has guessed (or the showdown timer runs out), the Mystery Player is
              revealed. You don't have to name them exactly — whoever's guess played alongside the most of the 5
              community cards wins the pot. Ties split it; if every guess links to none of them, the pot carries
              over to the next round.
            </p>
          </section>

          <section class="flex flex-col gap-1">
            <p class="field-label" style="color: var(--gold)">The match</p>
            <p>
              Chips carry over from round to round. The match ends once the agreed number of rounds is played, or
              as soon as only one player still has chips.
            </p>
          </section>
        </div>

        <button class="btn btn-kickoff" @click="$emit('close')">Got it</button>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
defineProps<{ open: boolean }>();
defineEmits<{ close: [] }>();
</script>
