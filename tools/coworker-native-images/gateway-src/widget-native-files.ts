// ChatGPT's documented imageIds widget state makes uploaded files visible on
// the follow-up turn. MCP ImageContent alone did not reach vision in live POC.
export const WIDGET_NATIVE_FILES_JS = `
let nativeMessageContent = [];
async function uploadNativeRequestImages(requestId, imageCount, isCurrent) {
  if (typeof window.openai?.uploadFile !== 'function' || typeof window.openai?.setWidgetState !== 'function') throw new Error('host_native_files_unavailable');
  const fileIds = [];
  const messageContent = [];
  for (let index = 0; index < imageCount; index++) {
    if (!isCurrent()) throw new Error('native_request_superseded');
    const result = await callHostTool('workbench_api_read_request', { request_id:requestId, image_index:index });
    const meta = result?.structuredContent;
    const blocks = result?.content?.filter(part => part.type === 'image') || [];
    if (result?.isError || meta?.request_id !== requestId || meta?.image_count !== imageCount
      || meta?.image_index !== index || blocks.length !== 1) throw new Error('native_image_read_failed');
    const image = blocks[0];
    if (!['image/png','image/jpeg','image/webp'].includes(image.mimeType) || typeof image.data !== 'string') throw new Error('native_image_invalid');
    const bytes = Uint8Array.from(atob(image.data), char => char.charCodeAt(0));
    if (!isCurrent()) throw new Error('native_request_superseded');
    const extension = image.mimeType === 'image/jpeg' ? 'jpg' : image.mimeType.split('/')[1];
    const file = new File([bytes], 'request-image-' + (index + 1) + '.' + extension, { type:image.mimeType });
    const uploaded = await window.openai.uploadFile(file, { library:false });
    if (!isCurrent()) throw new Error('native_request_superseded');
    if (typeof uploaded?.fileId !== 'string' || !uploaded.fileId || uploaded.fileId.length > 200) throw new Error('native_upload_invalid');
    fileIds.push(uploaded.fileId);
    messageContent.push({ type:'image', data:image.data, mimeType:image.mimeType });
  }
  nativeMessageContent = messageContent;
  return fileIds;
}
`;
