<script setup>
import { onMounted, onBeforeUnmount, ref, watch } from 'vue';
import { createEditor } from '@local/slidekit';
import '@local/slidekit/style.css';

const props = defineProps({ initialDocument: Object, locale: { type: String, default: 'zh-CN' }, pdfAssetsUrl: { type: String, default: '/slidekit-pdf/' } });
const emit = defineEmits(['change']);
const container = ref(null);
let editor;
let off;
onMounted(() => {
  editor = createEditor(container.value, { document: props.initialDocument, pdfAssetsUrl: props.pdfAssetsUrl, locale: props.locale });
  off = editor.on('change', () => emit('change', editor.getDocument()));
});
watch(() => props.locale, locale => editor?.setLocale(locale));
onBeforeUnmount(() => { off?.(); editor?.destroy(); });
defineExpose({ getEditor: () => editor });
</script>

<template><div ref="container" style="height: 720px; width: 100%" /></template>
