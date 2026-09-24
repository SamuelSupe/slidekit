/**
 * @typedef {{type: string, attrs?: Record<string, any>}} TextMark
 * @typedef {{type: string, text?: string, attrs?: Record<string, any>, marks?: TextMark[], content?: TextNode[]}} TextNode
 * @typedef {{offset: number, color: string, opacity: number}} GradientStop
 * @typedef {{type: 'linear', angle: number, scaled: boolean, rotateWithShape: boolean, stops: GradientStop[]}} Gradient
 * @typedef {{color: string, opacity: number, blur: number, offsetX: number, offsetY: number, rotateWithShape: boolean}} Shadow
 * @typedef {'none'|'triangle'|'stealth'|'arrow'|'diamond'|'oval'} ArrowEnd
 * @typedef {{x: number, y: number}} ConnectorPoint
 * @typedef {{id: string, type: 'text'|'shape'|'image', x: number, y: number, width: number, height: number, rotation: number, opacity: number, locked: boolean, content?: TextNode, fontFamily?: string, fontSize?: number, color?: string, lineHeight?: number, shape?: 'rect'|'roundRect'|'ellipse'|'line'|'arrow'|'rightArrow'|'leftArrow'|'upArrow'|'downArrow'|'leftRightArrow'|'upDownArrow', fill?: string, fillOpacity?: number, gradient?: Gradient|null, shadow?: Shadow|null, stroke?: string, strokeWidth?: number, strokeOpacity?: number, startArrow?: ArrowEnd, endArrow?: ArrowEnd, arrowShaft?: number, arrowHead?: number, points?: ConnectorPoint[]|null, assetId?: string, fit?: 'contain'|'cover'}} SlideElement
 * @typedef {{id: string, name: string, background: string, backgroundGradient?: Gradient|null, hidden?: boolean, elements: SlideElement[]}} Slide
 * @typedef {{data: string, width: number, height: number, name: string}} ImageAsset
 * @typedef {{schemaVersion: 1, title: string, width: number, height: number, slides: Slide[], assets: Record<string, ImageAsset>}} Deck
 * @typedef {{maxFileSizeMB?: number, maxPages?: number, maxRenderedSizeMB?: number}} PdfLimits
 * @typedef {{document?: Deck, mode?: 'edit'|'view', theme?: {accent?: string}, ui?: {toolbar?: boolean, thumbnails?: boolean, inspector?: boolean}, pdfAssetsUrl?: string, pdfLimits?: PdfLimits}} EditorOptions
 * @typedef {'change'|'selectionChange'|'slideChange'|'error'} EditorEvent
 */
export {};
