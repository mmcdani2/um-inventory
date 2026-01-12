import { AgGridReact } from "ag-grid-react"
import { ModuleRegistry } from "ag-grid-community"
import { ClientSideRowModelModule } from "ag-grid-community"
import { TextEditorModule } from "ag-grid-community"
import "ag-grid-community/styles/ag-grid.css"
import "ag-grid-community/styles/ag-theme-alpine.css"

import { weeklyCountColumns } from "./gridColumns"

ModuleRegistry.registerModules([
    ClientSideRowModelModule,
    TextEditorModule,
])


const navigateToNextCell = (params: any) => {
    const { key, previousCellPosition, nextCellPosition } = params

    if (key === "Enter") {
        return {
            rowIndex: previousCellPosition.rowIndex + 1,
            column: previousCellPosition.column,
            rowPinned: null,
        }
    }

    return nextCellPosition
}

const mockRowData = [
  {
    item_name: "Filter Drier",
    last_on_hand: 12,
    par_level: 10,
    on_hand: null,
  },
  {
    item_name: "TXV Valve",
    last_on_hand: 3,
    par_level: 5,
    on_hand: null,
  },
  {
    item_name: "R-410A Jug",
    last_on_hand: 5,
    par_level: 8,
    on_hand: null,
  },
]

const onCellKeyDown = (params: any) => {
    if (params.event.key === "Enter") {
        params.api.stopEditing()

        const nextRowIndex = params.node.rowIndex + 1
        const column = params.column

        params.api.setFocusedCell(nextRowIndex, column.getColId())
    }
}

export default function WeeklyCountGrid() {
    return (
        <div className="ag-theme-alpine" style={{ height: 400, width: "100%" }}>
            <AgGridReact
                rowData={mockRowData}
                columnDefs={weeklyCountColumns}
                onCellKeyDown={onCellKeyDown}
                stopEditingWhenCellsLoseFocus={true}
            />
        </div>
    )
}
