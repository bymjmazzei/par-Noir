/** Shared inline / lucide icons for Pen editor chrome. */
import type { SVGProps } from 'react';
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  ChevronDown,
  Clock,
  Eraser,
  Eye,
  EyeOff,
  Indent,
  Link2,
  List,
  ListOrdered,
  Lock,
  MessageSquare,
  Outdent,
  Plus,
  Redo2,
  Save,
  Search,
  Send,
  Share2,
  Table,
  Undo2,
  Unlock,
  Upload,
  Layers
} from 'lucide-react';

const sz = { width: 16, height: 16, strokeWidth: 2 } as const;

export function IconPreview(p: SVGProps<SVGSVGElement>) {
  return <Eye {...sz} {...p} />;
}
export function IconComments(p: SVGProps<SVGSVGElement>) {
  return <MessageSquare {...sz} {...p} />;
}
export function IconHistory(p: SVGProps<SVGSVGElement>) {
  return <Clock {...sz} {...p} />;
}
export function IconShare(p: SVGProps<SVGSVGElement>) {
  return <Share2 {...sz} {...p} />;
}
export function IconSave(p: SVGProps<SVGSVGElement>) {
  return <Save {...sz} {...p} />;
}
export function IconPublish(p: SVGProps<SVGSVGElement>) {
  return <Upload {...sz} {...p} />;
}
export function IconChevron(p: SVGProps<SVGSVGElement>) {
  return <ChevronDown width={12} height={12} strokeWidth={2} {...p} />;
}
export function IconUndo(p: SVGProps<SVGSVGElement>) {
  return <Undo2 {...sz} {...p} />;
}
export function IconRedo(p: SVGProps<SVGSVGElement>) {
  return <Redo2 {...sz} {...p} />;
}
export function IconLink(p: SVGProps<SVGSVGElement>) {
  return <Link2 {...sz} {...p} />;
}
export function IconClear(p: SVGProps<SVGSVGElement>) {
  return <Eraser {...sz} {...p} />;
}
export function IconInsert(p: SVGProps<SVGSVGElement>) {
  return <Plus {...sz} {...p} />;
}
export function IconAlignLeft(p: SVGProps<SVGSVGElement>) {
  return <AlignLeft {...sz} {...p} />;
}
export function IconAlignCenter(p: SVGProps<SVGSVGElement>) {
  return <AlignCenter {...sz} {...p} />;
}
export function IconAlignRight(p: SVGProps<SVGSVGElement>) {
  return <AlignRight {...sz} {...p} />;
}
export function IconAlignJustify(p: SVGProps<SVGSVGElement>) {
  return <AlignJustify {...sz} {...p} />;
}
export function IconBulletList(p: SVGProps<SVGSVGElement>) {
  return <List {...sz} {...p} />;
}
export function IconOrderedList(p: SVGProps<SVGSVGElement>) {
  return <ListOrdered {...sz} {...p} />;
}
export function IconIndent(p: SVGProps<SVGSVGElement>) {
  return <Indent {...sz} {...p} />;
}
export function IconOutdent(p: SVGProps<SVGSVGElement>) {
  return <Outdent {...sz} {...p} />;
}
export function IconSearch(p: SVGProps<SVGSVGElement>) {
  return <Search {...sz} {...p} />;
}
export function IconTable(p: SVGProps<SVGSVGElement>) {
  return <Table {...sz} {...p} />;
}
export function IconLayers(p: SVGProps<SVGSVGElement>) {
  return <Layers {...sz} {...p} />;
}
export function IconEye(p: SVGProps<SVGSVGElement>) {
  return <Eye {...sz} {...p} />;
}
export function IconEyeOff(p: SVGProps<SVGSVGElement>) {
  return <EyeOff {...sz} {...p} />;
}
export function IconLock(p: SVGProps<SVGSVGElement>) {
  return <Lock {...sz} {...p} />;
}
export function IconUnlock(p: SVGProps<SVGSVGElement>) {
  return <Unlock {...sz} {...p} />;
}
export function IconSend(p: SVGProps<SVGSVGElement>) {
  return <Send {...sz} {...p} />;
}
