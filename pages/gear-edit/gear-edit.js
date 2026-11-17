const api = require('../../utils/api');
const ui = require('../../utils/ui');
const guard = require('../../utils/guard');

const CONDITIONS = [
    { value: 'used', label: '二手闲置' },
    { value: 'new', label: '全新' },
];
const STATUSES = [
    { value: 'on_sale', label: '在售' },
    { value: 'reserved', label: '已预订' },
    { value: 'sold', label: '已售出' },
];

let imageSeed = 0;

function chooseImages(count) {
    return new Promise(resolve => {
        if (wx.chooseMedia) {
            wx.chooseMedia({
                count,
                mediaType: ['image'],
                sourceType: ['album', 'camera'],
                success: result => resolve((result.tempFiles || []).map(file => file.tempFilePath)),
                fail: () => resolve([]),
            });
        } else if (wx.chooseImage) {
            wx.chooseImage({
                count,
                success: result => resolve(result.tempFilePaths || []),
                fail: () => resolve([]),
            });
        } else {
            resolve([]);
        }
    });
}

Page({
    data: {
        id: null,
        isEdit: false,
        images: [],
        removedPaths: [],
        categoryIndex: 0,
        categories: ui.GEAR_CATEGORIES,
        categoryText: ui.GEAR_CATEGORIES[0],
        conditionIndex: 0,
        conditionLabels: CONDITIONS.map(item => item.label),
        conditionText: CONDITIONS[0].label,
        statusIndex: 0,
        statusLabels: STATUSES.map(item => item.label),
        statusText: STATUSES[0].label,
        title: '',
        price: '',
        originalPrice: '',
        description: '',
        tradePlace: '',
        contact: '',
        submitting: false,
        error: '',
    },

    async onLoad(options) {
        if (!(await guard.requirePublishPage())) return;
        if (options.id) {
            this.setData({ id: Number(options.id), isEdit: true });
            this.load(Number(options.id));
        }
    },

    async load(id) {
        const result = await api.get('gear_items', id);
        if (result.error || !result.data) {
            ui.toast(result.error ? result.error.message : '装备不存在');
            return;
        }
        const row = result.data;
        const paths = ui.parseImages(row.images);
        const urls = await api.signedUrls(paths);
        const images = paths.map((path, index) => {
            imageSeed += 1;
            return { key: `i${imageSeed}`, path, tempPath: '', url: urls[index] || '' };
        });
        const categoryIndex = Math.max(0, ui.GEAR_CATEGORIES.indexOf(row.category));
        const conditionIndex = Math.max(0, CONDITIONS.findIndex(item => item.value === row.condition_type));
        const statusIndex = Math.max(0, STATUSES.findIndex(item => item.value === row.status));
        this.setData({
            images,
            categoryIndex,
            categoryText: ui.GEAR_CATEGORIES[categoryIndex],
            conditionIndex,
            conditionText: CONDITIONS[conditionIndex].label,
            statusIndex,
            statusText: STATUSES[statusIndex].label,
            title: row.title || '',
            price: String(row.price || ''),
            originalPrice: row.original_price ? String(row.original_price) : '',
            description: row.description || '',
            tradePlace: row.trade_place || '',
            contact: row.contact || '',
        });
    },

    async onChooseImage() {
        const remain = 6 - this.data.images.length;
        if (remain <= 0) {
            ui.toast('最多上传 6 张图片');
            return;
        }
        const temps = await chooseImages(remain);
        if (temps.length === 0) return;
        const added = temps.map(tempPath => {
            imageSeed += 1;
            return { key: `i${imageSeed}`, path: '', tempPath, url: tempPath };
        });
        this.setData({ images: this.data.images.concat(added) });
    },

    onRemoveImage(event) {
        const index = Number(event.currentTarget.dataset.index);
        const images = this.data.images.slice();
        const removed = images.splice(index, 1)[0];
        const removedPaths = this.data.removedPaths.slice();
        if (removed && removed.path) removedPaths.push(removed.path);
        this.setData({ images, removedPaths });
    },

    onCategoryChange(event) {
        const index = Number(event.detail.value);
        this.setData({ categoryIndex: index, categoryText: ui.GEAR_CATEGORIES[index] });
    },
    onConditionChange(event) {
        const index = Number(event.detail.value);
        this.setData({ conditionIndex: index, conditionText: CONDITIONS[index].label });
    },
    onStatusChange(event) {
        const index = Number(event.detail.value);
        this.setData({ statusIndex: index, statusText: STATUSES[index].label });
    },
    onTitleInput(event) { this.setData({ title: event.detail.value }); },
    onPriceInput(event) { this.setData({ price: event.detail.value }); },
    onOriginalPriceInput(event) { this.setData({ originalPrice: event.detail.value }); },
    onDescriptionInput(event) { this.setData({ description: event.detail.value }); },
    onTradePlaceInput(event) { this.setData({ tradePlace: event.detail.value }); },
    onContactInput(event) { this.setData({ contact: event.detail.value }); },

    async onSubmit() {
        const data = this.data;
        if (!data.title.trim()) {
            this.setData({ error: '请填写装备标题' });
            return;
        }
        if (!Number.isFinite(Number(data.price)) || Number(data.price) < 0 || data.price === '') {
            this.setData({ error: '请填写正确的售价' });
            return;
        }
        this.setData({ submitting: true, error: '' });
        const pending = data.images.filter(image => image.tempPath);
        let uploaded = [];
        if (pending.length > 0) {
            const result = await api.uploadImages(pending.map(image => image.tempPath));
            if (result.error) {
                this.setData({ submitting: false, error: result.error.message });
                return;
            }
            uploaded = result.data;
        }
        let cursor = 0;
        const finalPaths = data.images.map(image => {
            if (image.path) return image.path;
            const path = uploaded[cursor] || '';
            cursor += 1;
            return path;
        }).filter(Boolean);
        const payload = {
            title: data.title.trim(),
            category: ui.GEAR_CATEGORIES[data.categoryIndex],
            condition_type: CONDITIONS[data.conditionIndex].value,
            price: Number(data.price),
            original_price: data.originalPrice === '' ? null : Number(data.originalPrice),
            description: data.description.trim(),
            images: ui.stringifyImages(finalPaths),
            trade_place: data.tradePlace.trim(),
            contact: data.contact.trim(),
            status: STATUSES[data.statusIndex].value,
        };
        const saved = data.isEdit
            ? await api.update('gear_items', data.id, payload)
            : await api.create('gear_items', payload);
        this.setData({ submitting: false });
        if (saved.error) {
            this.setData({ error: saved.error.message });
            return;
        }
        for (const path of data.removedPaths) {
            await api.removeImage(path);
        }
        ui.success(data.isEdit ? '已提交重新审核' : '已提交审核，通过后展示');
        setTimeout(() => wx.navigateBack(), 700);
    },

    async onDelete() {
        const agreed = await ui.confirm('删除后不可恢复，云端图片也会一并清除。', '删除装备');
        if (!agreed) return;
        const result = await api.remove('gear_items', this.data.id);
        if (result.error) {
            ui.toast(result.error.message);
            return;
        }
        for (const image of this.data.images) {
            if (image.path) await api.removeImage(image.path);
        }
        ui.success('已删除');
        setTimeout(() => wx.navigateBack(), 700);
    },
});
