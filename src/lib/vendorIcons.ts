/*
 * Vendor marks: a small monochrome logo per provider, bundled with the app.
 *
 * Marks are never fetched at run time: asking a logo service for "openai" would tell it which tools
 * you pay for, and the content security policy blocks it anyway. The SVGs come from two packages:
 * Lobe Icons (MIT, made for AI brands) and Simple Icons (CC0). A provider without a mark gets a
 * letter tile in the UI. The logos remain their owners' trademarks; they are used to name the
 * vendor of your own charges.
 */
import aws from '@lobehub/icons-static-svg/icons/aws.svg?raw';
import anthropic from '@lobehub/icons-static-svg/icons/anthropic.svg?raw';
import cloudflare from '@lobehub/icons-static-svg/icons/cloudflare.svg?raw';
import cohere from '@lobehub/icons-static-svg/icons/cohere.svg?raw';
import cursor from '@lobehub/icons-static-svg/icons/cursor.svg?raw';
import deepseek from '@lobehub/icons-static-svg/icons/deepseek.svg?raw';
import devin from '@lobehub/icons-static-svg/icons/devin.svg?raw';
import elevenlabs from '@lobehub/icons-static-svg/icons/elevenlabs.svg?raw';
import fireworks from '@lobehub/icons-static-svg/icons/fireworks.svg?raw';
import github from '@lobehub/icons-static-svg/icons/github.svg?raw';
import google from '@lobehub/icons-static-svg/icons/google.svg?raw';
import groq from '@lobehub/icons-static-svg/icons/groq.svg?raw';
import huggingface from '@lobehub/icons-static-svg/icons/huggingface.svg?raw';
import ideogram from '@lobehub/icons-static-svg/icons/ideogram.svg?raw';
import krea from '@lobehub/icons-static-svg/icons/krea.svg?raw';
import lovable from '@lobehub/icons-static-svg/icons/lovable.svg?raw';
import microsoft from '@lobehub/icons-static-svg/icons/microsoft.svg?raw';
import midjourney from '@lobehub/icons-static-svg/icons/midjourney.svg?raw';
import mistral from '@lobehub/icons-static-svg/icons/mistral.svg?raw';
import openai from '@lobehub/icons-static-svg/icons/openai.svg?raw';
import openrouter from '@lobehub/icons-static-svg/icons/openrouter.svg?raw';
import perplexity from '@lobehub/icons-static-svg/icons/perplexity.svg?raw';
import poe from '@lobehub/icons-static-svg/icons/poe.svg?raw';
import replicate from '@lobehub/icons-static-svg/icons/replicate.svg?raw';
import replit from '@lobehub/icons-static-svg/icons/replit.svg?raw';
import runway from '@lobehub/icons-static-svg/icons/runway.svg?raw';
import suno from '@lobehub/icons-static-svg/icons/suno.svg?raw';
import together from '@lobehub/icons-static-svg/icons/together.svg?raw';
import venice from '@lobehub/icons-static-svg/icons/venice.svg?raw';
import vercel from '@lobehub/icons-static-svg/icons/vercel.svg?raw';
import windsurf from '@lobehub/icons-static-svg/icons/windsurf.svg?raw';
import xai from '@lobehub/icons-static-svg/icons/xai.svg?raw';
import {
  siDigitalocean,
  siFlydotio,
  siGodaddy,
  siNamecheap,
  siNetlify,
  siPorkbun,
  siRailway,
  siRender,
  siSlack,
  siSupabase,
  type SimpleIcon,
} from 'simple-icons';

/** Keep only what the mark needs: our own wrapper sets size and colour, and the name is said by the text next to it. */
function fromLobe(raw: string): string {
  return raw
    .replace(/<title>.*?<\/title>/, '')
    .replace(/\s(height|width|style)="[^"]*"/g, '')
    .replace('<svg ', '<svg aria-hidden="true" focusable="false" ');
}

function fromSimple(icon: SimpleIcon): string {
  return `<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="${icon.path}"/></svg>`;
}

const key = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, '');

const MARKS: Record<string, string> = {
  amazonwebservices: fromLobe(aws),
  aws: fromLobe(aws),
  anthropic: fromLobe(anthropic),
  claude: fromLobe(anthropic),
  cloudflare: fromLobe(cloudflare),
  cohere: fromLobe(cohere),
  cursor: fromLobe(cursor),
  deepseek: fromLobe(deepseek),
  devin: fromLobe(devin),
  digitalocean: fromSimple(siDigitalocean),
  elevenlabs: fromLobe(elevenlabs),
  fireworksai: fromLobe(fireworks),
  flyio: fromSimple(siFlydotio),
  github: fromLobe(github),
  godaddy: fromSimple(siGodaddy),
  google: fromLobe(google),
  groq: fromLobe(groq),
  huggingface: fromLobe(huggingface),
  ideogram: fromLobe(ideogram),
  krea: fromLobe(krea),
  lovable: fromLobe(lovable),
  microsoft: fromLobe(microsoft),
  midjourney: fromLobe(midjourney),
  mistralai: fromLobe(mistral),
  mistral: fromLobe(mistral),
  namecheap: fromSimple(siNamecheap),
  netlify: fromSimple(siNetlify),
  openai: fromLobe(openai),
  openrouter: fromLobe(openrouter),
  perplexity: fromLobe(perplexity),
  poe: fromLobe(poe),
  porkbun: fromSimple(siPorkbun),
  railway: fromSimple(siRailway),
  render: fromSimple(siRender),
  replicate: fromLobe(replicate),
  replit: fromLobe(replit),
  runway: fromLobe(runway),
  slack: fromSimple(siSlack),
  suno: fromLobe(suno),
  supabase: fromSimple(siSupabase),
  togetherai: fromLobe(together),
  venice: fromLobe(venice),
  vercel: fromLobe(vercel),
  windsurf: fromLobe(windsurf),
  xai: fromLobe(xai),
};

/** The provider's mark as SVG markup, or null when there is none (the UI then shows a letter). */
export function vendorMark(provider: string): string | null {
  return MARKS[key(provider)] ?? null;
}

/** The letter for a provider without a mark: the first letter or digit of its name. */
export function vendorLetter(provider: string): string {
  return (provider.match(/[\p{L}\p{N}]/u)?.[0] ?? '?').toUpperCase();
}
