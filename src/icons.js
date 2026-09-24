import {
  createElement, PanelsTopLeft, Plus, Type, Image, Shapes, Play, Download, Upload, Undo2, Redo2,
  Copy, Trash2, ChevronDown, ChevronLeft, ChevronRight, Minus, Maximize2, Bold, Italic,
  Underline, AlignLeft, AlignCenter, AlignRight, List, ListOrdered, Layers, LockKeyhole,
  UnlockKeyhole, Eye, MousePointer2, PanelLeftClose, PanelRightClose, X, Circle, Square,
  RectangleHorizontal, MoveUpRight, Minus as Line, ArrowUpToLine, ArrowDownToLine,
  AlignStartVertical, AlignCenterVertical, AlignEndVertical, AlignStartHorizontal,
  AlignCenterHorizontal, AlignEndHorizontal, AlignHorizontalDistributeCenter,
  AlignVerticalDistributeCenter, Check, FileJson, Presentation, RotateCcw, HelpCircle,
} from 'lucide';

const icons = {
  logo: PanelsTopLeft, plus: Plus, text: Type, image: Image, shapes: Shapes, play: Play,
  download: Download, upload: Upload, undo: Undo2, redo: Redo2, copy: Copy, trash: Trash2,
  chevron: ChevronDown, previous: ChevronLeft, next: ChevronRight, minus: Minus,
  fit: Maximize2, bold: Bold, italic: Italic, underline: Underline, left: AlignLeft,
  center: AlignCenter, right: AlignRight, bulletList: List, orderedList: ListOrdered,
  layers: Layers, lock: LockKeyhole, unlock: UnlockKeyhole, eye: Eye, cursor: MousePointer2,
  panelLeft: PanelLeftClose, panelRight: PanelRightClose, close: X, ellipse: Circle,
  rect: Square, roundRect: RectangleHorizontal, arrow: MoveUpRight, line: Line,
  front: ArrowUpToLine, back: ArrowDownToLine, alignLeft: AlignStartVertical,
  alignCenter: AlignCenterVertical, alignRight: AlignEndVertical, alignTop: AlignStartHorizontal,
  alignMiddle: AlignCenterHorizontal, alignBottom: AlignEndHorizontal,
  distributeX: AlignHorizontalDistributeCenter, distributeY: AlignVerticalDistributeCenter,
  check: Check, json: FileJson, presentation: Presentation, reset: RotateCcw, help: HelpCircle,
};
export function icon(name, size = 18) {
  return createElement(icons[name] || icons.cursor, { width: size, height: size, 'stroke-width': 1.7, 'aria-hidden': 'true' });
}
