import type { ColDef } from "ag-grid-community"

export const weeklyCountColumns: ColDef[] = [
    {
        headerName: "Item",
        field: "item_name",
        editable: false,
        flex: 2,
    },
    {
        headerName: "Last On Hand",
        field: "last_on_hand",
        editable: false,
        width: 140,
    },
    {
        headerName: "On Hand",
        field: "on_hand",
        editable: true,
        width: 120,
        cellEditor: "agTextCellEditor",
        singleClickEdit: true,
    },
    {
        headerName: "Weekly Usage",
        valueGetter: (params) => {
            const onHand = params.data?.on_hand
            if (onHand === null || onHand === undefined || onHand === "") return ""

            const last = Number(params.data?.last_on_hand ?? 0)
            return last - Number(onHand)
        },
        width: 140,
    },
    {
        headerName: "Order Qty",
        valueGetter: (params) => {
            const onHand = params.data?.on_hand
            if (onHand === null || onHand === undefined || onHand === "") return ""

            const par = Number(params.data?.par_level ?? 0)
            return Math.max(par - Number(onHand), 0)
        },
        width: 120,
    },
]
