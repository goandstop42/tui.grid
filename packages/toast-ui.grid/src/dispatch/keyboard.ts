import { Store } from '@t/store';
import { SelectionRange } from '@t/store/selection';
import { EnterCommandType, KeyboardEventCommandType, TabCommandType } from '../helper/keyboard';
import { getNextCellIndex, getRemoveRange, getNextCellIndexWithRowSpan } from '../query/keyboard';
import { changeFocus, saveAndFinishEditing, startEditing } from './focus';
import { changeSelectionRange } from './selection';
import { isRowHeader } from '../helper/column';
import { getRowRangeWithRowSpan, isRowSpanEnabled } from '../query/rowSpan';
import { getDataManager, getInstance } from '../instance';
import { getEventBus } from '../event/eventBus';
import GridEvent from '../event/gridEvent';
import { createChangeInfo, isEditableCell, getRowKeyByIndexWithPageRange } from '../query/data';
import { forceValidateUniquenessOfColumns } from '../store/helper/validation';
import { copyDataToRange, getRangeToPaste } from '../query/clipboard';
import { mapProp } from '../helper/common';
import { CellChange, Origin } from '@t/event';
import { updateAllSummaryValues } from './summary';
import { appendRows, updateHeights } from './data';
import { isEditingCell } from '../query/focus';
import {Focus} from "@t/store/focus";
import {ViewRow} from "@t/store/data";

type ChangeValueFn = () => number;
interface ChangeInfo {
  prevChanges: CellChange[];
  nextChanges: CellChange[];
  changeValueFns: ChangeValueFn[];
}

export function moveFocus(store: Store, command: KeyboardEventCommandType) {
  const {
    focus,
    data,
    column: { visibleColumnsWithRowHeader },
    id,
  } = store;
  const { rowIndex, totalColumnIndex: columnIndex } = focus;

  if (rowIndex === null || columnIndex === null) {
    return;
  }

  const [nextRowIndex, nextColumnIndex] = getNextCellIndex(store, command, [rowIndex, columnIndex]);
  const nextColumnName = visibleColumnsWithRowHeader[nextColumnIndex].name;
  if (!isRowHeader(nextColumnName)) {
    focus.navigating = true;
    changeFocus(store, getRowKeyByIndexWithPageRange(data, nextRowIndex), nextColumnName, id);
  }
}

export function editFocus(store: Store, command: KeyboardEventCommandType) {
  const { rowKey, columnName } = store.focus;

  if (rowKey === null || columnName === null) {
    return;
  }

  if (command === 'currentCell') {
    startEditing(store, rowKey, columnName);
  } else if (
    command === 'nextCell' ||
    command === 'prevCell' ||
    command === 'up' ||
    command === 'down'
  ) {
    moveTabAndEnterFocus(store, command);
  }
}

export function moveTabAndEnterFocus(
  store: Store,
  command: TabCommandType | EnterCommandType,
  moveFocusByEnter = false
) {
  const { focus, data, column, id } = store;
  const { visibleColumnsWithRowHeader } = column;
  const { rowKey, columnName, rowIndex, totalColumnIndex: columnIndex } = focus;

  if (rowKey === null || columnName === null || rowIndex === null || columnIndex === null) {
    return;
  }

  const [nextRowIndex, nextColumnIndex] = getNextCellIndex(store, command, [rowIndex, columnIndex]);
  const nextRowKey = getRowKeyByIndexWithPageRange(data, nextRowIndex);
  const nextColumnName = visibleColumnsWithRowHeader[nextColumnIndex].name;
  const moveAndEditFromLastCellByEnter =
    rowIndex === nextRowIndex && columnIndex === nextColumnIndex && moveFocusByEnter;

  if (!isRowHeader(nextColumnName)) {
    focus.navigating = true;
    changeFocus(store, nextRowKey, nextColumnName, id);

    if (focus.tabMode === 'moveAndEdit') {
      if (moveAndEditFromLastCellByEnter) {
        saveAndFinishEditing(store);
      } else if (focus.rowKey === nextRowKey && focus.columnName === nextColumnName) {
        setTimeout(() => {
          startEditing(store, nextRowKey, nextColumnName);
        });
      }
    }
  }
}

export function moveSelection(store: Store, command: KeyboardEventCommandType) {
  const { selection, focus, data, column, id } = store;
  const { visibleColumnsWithRowHeader, rowHeaderCount } = column;
  const { filteredViewData, sortState } = data;
  const { rowIndex: focusRowIndex, totalColumnIndex: totalFocusColumnIndex } = focus;
  let { inputRange: currentInputRange } = selection;

  if (focusRowIndex === null || totalFocusColumnIndex === null) {
    return;
  }

  if (!currentInputRange) {
    currentInputRange = selection.inputRange = {
      row: [focusRowIndex, focusRowIndex],
      column: [totalFocusColumnIndex, totalFocusColumnIndex],
    };
  }

  const rowLength = filteredViewData.length;
  const columnLength = visibleColumnsWithRowHeader.length;
  let rowStartIndex = currentInputRange.row[0];
  const rowIndex = currentInputRange.row[1];
  let columnStartIndex = currentInputRange.column[0];
  const columnIndex = currentInputRange.column[1];
  let nextCellIndexes;

  if (command === 'all') {
    rowStartIndex = 0;
    columnStartIndex = rowHeaderCount;
    nextCellIndexes = [rowLength - 1, columnLength - 1];
  } else {
    nextCellIndexes = getNextCellIndex(store, command, [rowIndex, columnIndex]);
    if (isRowSpanEnabled(sortState, column)) {
      nextCellIndexes = getNextCellIndexWithRowSpan(
        store,
        command,
        rowIndex,
        [columnStartIndex, columnIndex],
        nextCellIndexes
      );
    }
  }

  const [nextRowIndex, nextColumnIndex] = nextCellIndexes;
  const nextColumnName = visibleColumnsWithRowHeader[nextColumnIndex].name;
  let startRowIndex = rowStartIndex;
  let endRowIndex = nextRowIndex;

  if (command !== 'all') {
    [startRowIndex, endRowIndex] = getRowRangeWithRowSpan(
      [startRowIndex, endRowIndex],
      [columnStartIndex, nextColumnIndex],
      column,
      focus.rowIndex,
      data
    );
  }

  if (!isRowHeader(nextColumnName)) {
    const inputRange: SelectionRange = {
      row: [startRowIndex, endRowIndex],
      column: [columnStartIndex, nextColumnIndex],
    };

    changeSelectionRange(selection, inputRange, id);
  }
}

export function removeContent(store: Store) {
  const { column, data } = store;
  const range = getRemoveRange(store);

  if (!range) {
    return;
  }

  const {
    column: [columnStart, columnEnd],
    row: [rowStart, rowEnd],
  } = range;
  const changeValueFns: ChangeValueFn[] = [];
  const prevChanges: CellChange[] = [];
  const nextChanges: CellChange[] = [];

  data.filteredRawData.slice(rowStart, rowEnd + 1).forEach((row, index) => {
    column.visibleColumnsWithRowHeader.slice(columnStart, columnEnd + 1).forEach(({ name }) => {
      const rowIndex = index + rowStart;
      if (isEditableCell(store, rowIndex, name)) {
        const { prevChange, nextChange, changeValue } = createChangeInfo(
          store,
          row,
          name,
          '',
          rowIndex
        );
        prevChanges.push(prevChange);
        nextChanges.push(nextChange);
        changeValueFns.push(changeValue);
      }
    });
  });
  updateDataByKeyMap(store, 'delete', { prevChanges, nextChanges, changeValueFns });
}

function applyCopiedData(store: Store, copiedData: string[][], range: SelectionRange) {
  const { data, column } = store;
  const { filteredRawData, filteredViewData } = data;
  const { visibleColumnsWithRowHeader } = column;
  const {
    row: [startRowIndex, endRowIndex],
    column: [startColumnIndex, endColumnIndex],
  } = range;
  const columnNames = mapProp('name', visibleColumnsWithRowHeader);
  const changeValueFns = [];
  const prevChanges = [];
  const nextChanges = [];

  for (let rowIndex = 0; rowIndex + startRowIndex <= endRowIndex; rowIndex += 1) {
    const rawRowIndex = rowIndex + startRowIndex;
    for (let columnIndex = 0; columnIndex + startColumnIndex <= endColumnIndex; columnIndex += 1) {
      const name = columnNames[columnIndex + startColumnIndex];
      if (filteredViewData.length && isEditableCell(store, rawRowIndex, name)) {
        const targetRow = filteredRawData[rawRowIndex];
        // //console.log('filteredRawData[rawRowIndex] >> ', filteredRawData[rawRowIndex], rawRowIndex);
        // //console.log('targetRow[rawRowIndex] >> ', targetRow);
        const { prevChange, nextChange, changeValue } = createChangeInfo(
          store,
          targetRow,
          name,
          copiedData[rowIndex][columnIndex],
          rawRowIndex
        );
        prevChanges.push(prevChange);
        nextChanges.push(nextChange);
        changeValueFns.push(changeValue);
      }
    }
  }
  updateDataByKeyMap(store, 'paste', { prevChanges, nextChanges, changeValueFns });
}

export function paste(store: Store, copiedData: string[][]) {
  const {
    selection,
    id,
    data: { viewData, filteredViewData },
    column: { visibleColumnsWithRowHeader },
    focus,
  } = store;


  // editable 아닌 컬럼은 copy & paste 안 되도록 함
  const focusKey = focus.rowKey || '';
  const focusColumnName = focus.columnName || '';
  if (focus.rowKey) {
    const editable = (filteredViewData as { [key: string]: any })[focusKey]?.valueMap[
      focusColumnName
    ]?.editable;
    if (!editable) {
      return;
    }
  }

  const { originalRange } = selection;

  if (originalRange) {
    copiedData = copyDataToRange(originalRange, copiedData);
  }

  const rangeToPaste = getRangeToPaste(store, copiedData);
  const endRowIndex = rangeToPaste.row[1];
  const result = [];

  const {
    row: [startRowIndex],
    column: [startColumnIndex, endColumnIndex],
  } = rangeToPaste;

  const columnNames = mapProp('name', visibleColumnsWithRowHeader);
  console.log('columnNames >> ', visibleColumnsWithRowHeader);
  for (let rowIndex = 0; rowIndex + startRowIndex <= endRowIndex; rowIndex += 1) {
    const rowObject = {};
    for (let columnIndex = 0; columnIndex + startColumnIndex <= endColumnIndex; columnIndex += 1) {
      const name = columnNames[columnIndex + startColumnIndex];
      (rowObject as any)[name] = copiedData[rowIndex][columnIndex];
    }
    result.push(rowObject);
  }

  if (endRowIndex > viewData.length - 1) {
    const modifiedResult = result.slice(-(endRowIndex - viewData.length + 1));
    appendRows(
      store,
      // [...Array(endRowIndex - viewData.length + 1)].map(() => ({}))
      // result
      modifiedResult
    );
  } else {
    const currentInstance = getInstance(id);

    let resultIndex = 0;
    // rowKey로 행 정보를 가져오지 않고 rowIndex를 이용한다.
    for (let i = store.focus?.rowIndex ?? 0; i <= endRowIndex; i += 1) {
      // const currentRow = currentInstance.getRow()!;
      const currentRow = currentInstance.getRowAt(i)!;
      const modifiedCopiedData = result[resultIndex] as { [key: string]: any };

      updateRow(currentRow, modifiedCopiedData, columnNames);

      currentInstance.setRow(currentRow.rowKey, currentRow);
      resultIndex += 1;
    }
  }
  applyCopiedData(store, copiedData, rangeToPaste);
  changeSelectionRange(selection, rangeToPaste, id);
}

function updateRow(
  currentRow: { [key: string]: any },
  modifiedData: { [key: string]: any },
  columnNames: string[]
) {
  for (const key in modifiedData) {
    if (modifiedData.hasOwnProperty(key)) {
      if (columnNames.includes(key)) {
        currentRow[key] = modifiedData[key];
      }
    } else {
      console.warn(`Skipped inherited property '${key}' from modifiedData object.`);
    }
  }
}

export function updateDataByKeyMap(store: Store, origin: Origin, changeInfo: ChangeInfo) {
  const { id, data, column } = store;
  const { rawData, filteredRawData } = data;
  const { prevChanges, nextChanges, changeValueFns } = changeInfo;
  const eventBus = getEventBus(id);
  const manager = getDataManager(id);
  let gridEvent = new GridEvent({ origin, changes: prevChanges });

  /**
   * Occurs before one or more cells is changed
   * @event Grid#beforeChange
   * @property {string} origin - The type of change('paste', 'delete', 'cell')
   * @property {Array.<object>} changes - rowKey, column name, original values and next values before changing the values
   * @property {Grid} instance - Current grid instance
   */
  eventBus.trigger('beforeChange', gridEvent);

  if (gridEvent.isStopped()) {
    return;
  }

  let index: number | null = null;
  changeValueFns.forEach((changeValue) => {
    const targetRowIndex = changeValue();
    if (index !== targetRowIndex) {
      index = targetRowIndex;
      manager.push('UPDATE', [filteredRawData[index]]);
    }
  });
  updateAllSummaryValues(store);
  forceValidateUniquenessOfColumns(rawData, column);
  updateHeights(store);

  gridEvent = new GridEvent({ origin, changes: nextChanges });

  /**
   * Occurs after one or more cells is changed
   * @event Grid#afterChange
   * @property {string} origin - The type of change('paste', 'delete', 'cell')
   * @property {Array.<object>} changes - rowKey, column name, previous values and changed values after changing the values
   * @property {Grid} instance - Current grid instance
   */
  eventBus.trigger('afterChange', gridEvent);
}
