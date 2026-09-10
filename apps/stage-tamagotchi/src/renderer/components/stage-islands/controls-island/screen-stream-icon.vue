<script setup lang="ts">
defineProps<{
  live?: boolean
}>()
</script>

<template>
  <svg
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <rect
      x="3.25"
      y="3.75"
      width="17.5"
      height="12.5"
      rx="1.75"
      stroke="currentColor"
      stroke-width="1.5"
    />
    <path
      d="M8 19.25h8"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
    />
    <path
      d="M12 16.25v3"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
    />

    <path
      v-if="!live"
      d="M8.25 10.15c1.15 1.7 2.55 2.45 3.75 2.45s2.6-.75 3.75-2.45"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
    />

    <g v-else class="screen-stream-eye-live">
      <path
        d="M7.4 10.15c1.35-2.05 2.95-3.05 4.6-3.05s3.25 1 4.6 3.05c-1.35 2.05-2.95 3.05-4.6 3.05s-3.25-1-4.6-3.05Z"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linejoin="round"
      />
      <circle
        cx="12"
        cy="10.15"
        r="1.55"
        fill="currentColor"
      />
    </g>
  </svg>
</template>

<style scoped>
.screen-stream-eye-live {
  color: #ef4444;
}
</style>
