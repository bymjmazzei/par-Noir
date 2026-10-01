import { describe, expect, it } from 'vitest';
import { compileAgentLibraryHtml } from './agentLibrary.js';
import { materializePenAgentBuild } from './agent.js';

const html = `<pen-page page-size="ratio-9-16" orientation="portrait" gallery-aspect="9/16">
  <pen-video src="https://cdn.example/clip.mp4" x="0" y="0" w="360" h="640"></pen-video>
  <pen-button behavior="poll.vote" x="24" y="400" w="120" h="40">Yes</pen-button>
</pen-page>`;

describe('compileAgentLibraryHtml', () => {
  it('compiles aspect, orientation, a video, and a vote into native layers', () => {
    const compiled = compileAgentLibraryHtml(html);
    expect(compiled.page.pageSize).toBe('ratio-9-16');
    expect(compiled.page.pageOrientation).toBe('portrait');
    expect(compiled.page.galleryAspect).toBe('9/16');
    const video = compiled.layers.find((layer) => layer.kind === 'video');
    const button = compiled.layers.find((layer) => layer.kind === 'interactive');
    expect(video?.videoSrc).toContain('clip.mp4');
    expect(button?.behavior).toBe('poll.vote');
    expect(button?.widgetElement).toBe('button');
    expect(compiled.layers.some((layer) => layer.widgetElement === 'html')).toBe(false);
  });

  it('keeps decorative markup as one html layer', () => {
    const compiled = compileAgentLibraryHtml('<pen-page><div class="card">Hi</div></pen-page>');
    expect(compiled.layers).toHaveLength(1);
    expect(compiled.layers[0]?.widgetElement).toBe('html');
    expect(compiled.layers[0]?.htmlSource).toContain('card');
  });
});

describe('materializePenAgentBuild library html', () => {
  it('writes the compiled page and layers onto the doc', () => {
    const result = materializePenAgentBuild({
      templateId: 'widget.v1',
      title: 'Poll card',
      sections: [{ slug: 'card', html }]
    });
    expect(result.manifest.pageSize).toBe('ratio-9-16');
    expect(result.manifest.pageOrientation).toBe('portrait');
    const button = result.sections[0]?.layers?.find((layer) => layer.kind === 'interactive');
    expect(button?.behavior).toBe('poll.vote');
    expect(result.sections[0]?.layers?.some((layer) => layer.widgetElement === 'html')).toBe(false);
  });
});
