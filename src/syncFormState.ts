export function syncFormState(src: HTMLElement, dst: HTMLElement) {
    const srcFields = src.querySelectorAll('input, textarea, select, option')
    const dstFields = dst.querySelectorAll('input, textarea, select, option')
    if (srcFields.length !== dstFields.length) return

    for (let i = 0; i < srcFields.length; i++) {
        const s = srcFields[i] as HTMLElement
        const d = dstFields[i] as HTMLElement
        switch (s.tagName) {
            case 'INPUT': {
                const si = s as HTMLInputElement
                const di = d as HTMLInputElement
                if (si.type === 'checkbox' || si.type === 'radio') {
                    if (si.checked) di.setAttribute('checked', '')
                    else di.removeAttribute('checked')
                } else {
                    di.setAttribute('value', si.value)
                }
                break
            }
            case 'TEXTAREA':
                ;(d as HTMLTextAreaElement).textContent = (s as HTMLTextAreaElement).value
                break
            case 'SELECT': {
                const ss = s as HTMLSelectElement
                const ds = d as HTMLSelectElement
                ds.selectedIndex = ss.selectedIndex
                break
            }
            case 'OPTION':
                if ((s as HTMLOptionElement).selected) d.setAttribute('selected', '')
                else d.removeAttribute('selected')
                break
        }
    }
}
