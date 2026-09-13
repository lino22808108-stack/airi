<script setup lang="ts">
defineProps<{
  lit?: boolean
}>()
</script>

<template>
  <svg
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
    :class="lit ? 'overlay-tv-lit' : ''"
  >
    <!-- antennas -->
    <path
      d="M12 5.4 8.4 2.05"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
    />
    <path
      d="M12 5.4 15.6 2.05"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
    />
    <circle cx="8.25" cy="1.85" r="0.85" fill="currentColor" />
    <circle cx="15.75" cy="1.85" r="0.85" fill="currentColor" />

    <!-- CRT body -->
    <rect
      x="3.35"
      y="5.15"
      width="17.3"
      height="13.35"
      rx="2.4"
      stroke="currentColor"
      stroke-width="1.5"
    />

    <!-- empty inner screen -->
    <rect
      x="5.35"
      y="7.15"
      width="10.15"
      height="9.35"
      rx="1.35"
      stroke="currentColor"
      stroke-width="1.5"
    />

    <!-- side knobs -->
    <circle
      cx="17.7"
      cy="9.35"
      r="1.05"
      stroke="currentColor"
      stroke-width="1.4"
    />
    <circle
      cx="17.7"
      cy="12.85"
      r="1.05"
      stroke="currentColor"
      stroke-width="1.4"
    />

    <!-- stand -->
    <path
      d="M8.1 18.5 6.7 21.35"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
    />
    <path
      d="M15.9 18.5 17.3 21.35"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
    />
    <path
      d="M5.55 21.35h3.15"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
    />
    <path
      d="M15.3 21.35h3.15"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
    />
  </svg>
</template>

<style scoped>
.overlay-tv-lit {
  color: #ffffff;
  filter: drop-shadow(0 0 2px rgba(255, 255, 255, 0.95)) drop-shadow(0 0 6px rgba(255, 255, 255, 0.55));
}
</style>
