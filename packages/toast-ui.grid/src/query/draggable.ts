import { ColumnInfo } from '@t/store/column';
import { Store } from '@t/store';
import { RowKey, ViewRow, Row } from '@t/store/data';
import { findOffsetIndex, fromArray, clamp } from '../helper/common';
import { cls } from '../helper/dom';
import { findIndexByRowKey } from './data';
import { findColumnIndexByPosition } from './mouse';

export interface PosInfo {
  pageX: number;
  pageY: number;
  left: number;
  top: number;
  scrollLeft: number;
  scrollTop: number;
  container?: HTMLElement;
  rowKey?: RowKey;
}

export interface DraggableRowInfo {
  row: HTMLElement;
  rowKey: RowKey;
  line: HTMLElement;
  targetRow?: Row;
}

export interface DraggableColumnInfo {
  column: HTMLElement;
  columnName: string;
  targetColumn?: ColumnInfo;
}

export interface MovedIndexAndPosInfoOfRow {
  index: number;
  height: number;
  offsetLeft: number;
  offsetTop: number;
  targetRow: Row;
  moveToLast: boolean;
}

export interface MovedIndexAndPosInfoOfColumn {
  index: number;
  offsetLeft: number;
  targetColumn: ColumnInfo;
}

export interface FloatingRowSize {
  width: number;
  height: number;
}

interface FloatingRowOffsets {
  offsetLeft: number;
  offsetTop: number;
}

const EXCEED_RATIO = 0.8;
const ADDITIONAL_HEIGHT = 10;

// drag 할 때 보이는 row html
function createRow(height: string) {
  // console.log('createRow >> ')
  const row = document.createElement('div');
  row.className = cls('floating-row');
  row.style.height = height;
  row.style.lineHeight = height;
  row.style.width = 'auto';

  return row;
}

function createColumn(height: number, width: number) {
  const column = document.createElement('div');

  column.className = cls('floating-column');
  column.style.width = `${width}px`;
  column.style.lineHeight = `${height}px`;

  return column;
}

//로우 선택해서 drag 할 때 보여지는 floating-row에 td 값을 붙인다.
export function createCells(cell: Element) {
  const childLen = cell.childNodes.length;
  const el = document.createElement('div');
  el.className = cls('floating-cell', 'cell-header');
  el.style.width = window.getComputedStyle(cell).width;
  for (let i = 0; i < childLen; i += 1) {
    // the cell is not complex structure, so there is no the performance problem
    el.appendChild(cell.childNodes[i].cloneNode(true));
  }

  return el;
}

function createTreeCell(treeColumnName: string, viewRow: ViewRow) {
  const cell = document.createElement('div');
  const iconStyle = viewRow.treeInfo!.leaf ? '' : 'background-position: -39px -35px';

  const span = document.createElement('span');
  span.className = cls('floating-tree-cell-content');
  span.textContent = String(viewRow.valueMap[treeColumnName].value);

  cell.className = cls('floating-tree-cell');
  cell.innerHTML = `
    <span class="${cls('tree-icon')}">
      <i style="${iconStyle}"></i>
    </span>
  `;
  cell.appendChild(span);

  return cell;
}

function createFloatingDraggableRow(
  store: Store,
  rowKey: RowKey,
  offsetLeft: number,
  offsetTop: number,
  posInfo: PosInfo
) {
  const { data, column, id } = store;
  const { treeColumnName } = column;
  const cells = fromArray(posInfo.container!.querySelectorAll(`[data-row-key="${rowKey}"]`));
  // console.log('createFloatingDraggableRow  cells >> ', cells)
  // get original table row height
  const height = `${cells[0].parentElement!.clientHeight}px`;
  const row = createRow(height);
//console.log('createFloatingDraggableRow row >> ',row)
  row.style.left = `${offsetLeft}px`;
  row.style.top = `${offsetTop}px`;

  if (treeColumnName) {
    const index = findIndexByRowKey(data, column, id, rowKey);
    const viewRow = data.viewData[index];

    row.appendChild(createTreeCell(treeColumnName, viewRow));
  } else {
    cells.forEach((cell) => {
      // 로우 선택해서 drag 할 때 보여지는 floating-row에 td 값을 붙인다.
      row.appendChild(createCells(cell));
    });
  }

  return row;
}

function createFloatingDraggableColumn(store: Store, colunmName: string, posInfo: PosInfo) {
  const cell = posInfo.container!.querySelector(`[data-column-name="${colunmName}"]`)!;
  const { clientHeight, clientWidth } = cell;
  const { left } = cell.getBoundingClientRect();

  const column = createColumn(clientHeight, clientWidth);

  column.className = cls('floating-column');
  column.style.left = `${left - store.dimension.offsetLeft}px`;

  column.appendChild(createCells(cell));

  return column;
}

export function createDraggableRowInfo(store: Store, posInfo: PosInfo): DraggableRowInfo | null {
//  console.log('createDraggableRowInfo >> ')

  const { data, dimension } = store;
  const { rawData, filters } = data;

  // if there is any filter condition, cannot drag the row
  if (!rawData.length || filters?.length) {
    return null;
  }

  const { offsetLeft, offsetTop, index } = getMovedPosAndIndexOfRow(store, posInfo);
  const { rowKey, _attributes } = rawData[index];
  const row = createFloatingDraggableRow(store, rowKey, offsetLeft, offsetTop, posInfo);

  return _attributes.disabled
    ? null
    : {
        row,
        rowKey,
        line: createFloatingLine(dimension.scrollYWidth),
      };
}

export function createDraggableColumnInfo(store: Store, posInfo: PosInfo): DraggableColumnInfo {
  const { targetColumn } = getMovedPosAndIndexOfColumn(store, posInfo);
  const { name: columnName } = targetColumn;

  const column = createFloatingDraggableColumn(store, columnName, posInfo);

  return { column, columnName, targetColumn };
}

export function getMovedPosAndIndexOfRow(
  store: Store,
  { pageX, pageY, left, top, scrollTop, rowKey }: PosInfo
): MovedIndexAndPosInfoOfRow {

// console.log('rowKey  getMovedPosAndIndexOfRow  >> ', rowKey)
  const { rowCoords, dimension, column, data, id } = store;
  const { heights, offsets } = rowCoords;
  const { rawData } = data;
  const { headerHeight } = dimension;
  const offsetLeft = pageX - left;
  const offsetTop = pageY - top + scrollTop;
  let index = findOffsetIndex(rowCoords.offsets, offsetTop);

  // move to next index when exceeding the height with ratio
  if (!column.treeColumnName) {
    // grid 안에서 이동할 때
    // index 선택 로우
    if (index < rawData.length - 1 && offsetTop - offsets[index] > heights[index] * EXCEED_RATIO) {
      // console.log("getMovedPosAndIndexOfRow >> index < rawData.length - 1   > ", index < rawData.length - 1 )
      // console.log("getMovedPosAndIndexOfRow >> offsetTop - offsets[index] > heights[index] * EXCEED_RATIO   > ", offsetTop - offsets[index] > heights[index] * EXCEED_RATIO )
      index += 1;

    } else if ((offsetTop - heights[index] <= -heights[index]) || (offsetTop - heights[index] >= offsets[index] ) ) {
      if (rowKey !== undefined) {
        index = +rowKey;
      }
      // console.log('getMovedPosAndIndexOfRow out of grid >> ',rowKey ,id, index, offsetLeft, offsetTop, store)
    }
  }
  let height = offsets[index] - scrollTop + headerHeight;
  let moveToLast = false;
  // resolve the height for moving to last index with tree data
  if (column.treeColumnName) {
    if (rawData.length - 1 === index && offsetTop > offsets[index] + heights[index]) {
      height += heights[index];
      moveToLast = true;
    }
  }

  return {
    index,
    height,
    offsetLeft,
    offsetTop: offsetTop - scrollTop + headerHeight,
    targetRow: rawData[index],
    moveToLast,
  };
}

export function getMovedPosAndIndexOfColumn(
  store: Store,
  { pageX, pageY, scrollTop, scrollLeft }: PosInfo,
  offsetLeftOfDragColumn?: number,
  floatingColumnWidth?: number
): MovedIndexAndPosInfoOfColumn {
  const { dimension, column } = store;
  const { offsetLeft: containerLeft, width: containerWidth } = dimension;
  const floatingWidth = floatingColumnWidth || 0;
  const offsetLeftOfFloatingColumn = offsetLeftOfDragColumn || 0;

  const viewInfo = { pageX, pageY, scrollTop, scrollLeft };
  const index = findColumnIndexByPosition(store, viewInfo);
  const targetColumn = column.allColumns[index];

  let offsetLeft = pageX - offsetLeftOfFloatingColumn - containerLeft;

  if (offsetLeft < 0) {
    offsetLeft = 0;
  } else if (offsetLeft + floatingWidth > containerWidth) {
    offsetLeft = containerWidth - floatingWidth;
  }

  return {
    index,
    offsetLeft,
    targetColumn,
  };
}

export function createFloatingLine(scrollYWidth: number) {
  const line = document.createElement('div');

  line.className = cls('floating-line');
  line.style.width = `calc(100% - ${scrollYWidth}px)`;

  return line;
}

export function getResolvedOffsets(
  { dimension }: Store,
  { offsetLeft, offsetTop }: FloatingRowOffsets,
  { width }: FloatingRowSize
) {
  const { width: bodyWidth, bodyHeight, scrollXHeight } = dimension;

  
  return {
    offsetLeft,
    offsetTop
    // as-is : drag 할 때 grid 내에서만 움직임
    // offsetLeft: clamp(offsetLeft, 0, bodyWidth - width),
    // offsetTop: clamp(offsetTop, 0, bodyHeight + scrollXHeight + ADDITIONAL_HEIGHT),
  };
}
