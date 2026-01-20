import Controller from 'sap/ui/core/mvc/Controller';
import Filter from 'sap/ui/model/Filter';
import FilterOperator from 'sap/ui/model/FilterOperator';
import Sorter from 'sap/ui/model/Sorter';
import JSONModel from 'sap/ui/model/json/JSONModel';
import Text from 'sap/m/Text';
import Event from 'sap/ui/base/Event';
import Table from 'sap/m/Table';
import SearchField from 'sap/m/SearchField';
import ListBinding from 'sap/ui/model/ListBinding';
import ColumnListItem from 'sap/m/ColumnListItem';
import MessageToast from 'sap/m/MessageToast';
import MessageBox from 'sap/m/MessageBox';
import ODataModel from 'sap/ui/model/odata/v2/ODataModel';
import Dialog from 'sap/m/Dialog';
import Button from 'sap/m/Button';
import HTML from 'sap/ui/core/HTML';
import type {
  GetPricingAndStockBySkuRequest,
  GetPricingAndStockBySkuResponse,
  PricingTier,
  Availability,
} from '@GERAL-STT/component-pricing-api';
import { ApiName } from 'project1/supplier-mapping';

interface ContextLike {
  getProperty(path: string): string | undefined;
}

interface ODataRecord {
  SupplierMaterialNumber?: string;
}

/**
 * @namespace project1.controller
 */
export default class View1 extends Controller {
  private currentInfoRecordContext: ContextLike | null = null;
  private currentSupplier: string | null = null;

  public onInit(): void {
    // Controller initialization
  }

  public onSearch(oEvent: Event): void {
    const oSource = oEvent.getSource();
    const sQuery = (oSource as SearchField).getValue();
    const oTable = this.byId('supplierTable') as Table;
    const oBinding = oTable.getBinding('items') as ListBinding;

    const aFilters = [];
    if (sQuery && sQuery.length > 0) {
      aFilters.push(
        new Filter({
          filters: [
            new Filter('Supplier', FilterOperator.Contains, sQuery),
            new Filter('SupplierName', FilterOperator.Contains, sQuery),
          ],
          and: false,
        }),
      );
    }

    oBinding.filter(aFilters);
  }

  public onInfoRecordSearch(oEvent: Event): void {
    const oSource = oEvent.getSource();
    const sQuery = (oSource as SearchField).getValue();
    const oInfoRecordTable = this.byId('infoRecordTable') as Table;
    const oBinding = oInfoRecordTable.getBinding('items') as ListBinding;

    const aFilters = [];

    // Add search filters if query exists
    if (sQuery && sQuery.length > 0) {
      aFilters.push(
        new Filter({
          filters: [
            new Filter('PurchasingInfoRecord', FilterOperator.Contains, sQuery),
            new Filter('Material', FilterOperator.Contains, sQuery),
          ],
          and: false,
        }),
      );
    }

    oBinding.filter(aFilters);
  }

  public onSupplierPress(oEvent: Event): void {
    const oItem = oEvent.getSource();
    const oContext = (oItem as ColumnListItem).getBindingContext();
    if (!oContext) return;

    const sSupplier = oContext.getProperty('Supplier') as string;
    const sSupplierName = oContext.getProperty('SupplierName') as string;

    // Store the current supplier for filtering
    this.currentSupplier = sSupplier;

    const oInfoRecordTable = this.byId('infoRecordTable') as Table;
    
    // Get the OData model
    const oODataModel = this.getView()?.getModel('infoRecord') as ODataModel;
    
    // Read data directly from OData and put in JSON model to avoid key-based deduplication
    oODataModel.read('/A_PurInfoRecdPrcgCndnValidity', {
      filters: [new Filter('Supplier', FilterOperator.EQ, sSupplier)],
      sorters: [
        new Sorter('ConditionRecord', true), // descending
        new Sorter('ConditionType', false)   // ascending
      ],
      success: (oData: { results: object[] }) => {
        // Create or update JSON model with the data
        let oJSONModel = oInfoRecordTable.getModel('infoRecordData') as JSONModel | undefined;
        if (!oJSONModel) {
          oJSONModel = new JSONModel(oData.results);
          oInfoRecordTable.setModel(oJSONModel, 'infoRecordData');
        } else {
          oJSONModel.setData(oData.results);
        }
        
        // Unbind first if already bound
        if (oInfoRecordTable.isBound('items')) {
          oInfoRecordTable.unbindItems();
        }
        
        // Create template programmatically
        const oTemplate = new ColumnListItem({
          cells: [
            new Text({ text: "{infoRecordData>ConditionRecord}" }),
            new Text({ text: "{infoRecordData>PurchasingInfoRecord}" }),
            new Text({ text: "{infoRecordData>ConditionType}" }),
            new Text({ text: "{infoRecordData>Supplier}" }),
            new Text({ text: "{infoRecordData>Material}" }),
            new Text({ text: "{infoRecordData>ConditionValidityStartDate}" }),
            new Text({ text: "{infoRecordData>ConditionValidityEndDate}" })
          ]
        });
        
        // Bind to JSON model
        oInfoRecordTable.bindItems({
          path: 'infoRecordData>/',
          template: oTemplate
        });
        
        oInfoRecordTable.setVisible(true);
      },
      error: () => {
        MessageToast.show('Error loading pricing conditions');
      }
    });

    MessageToast.show(`Loading pricing conditions for: ${sSupplierName}`);
  }

  public onCloseInfoRecord(): void {
    const oInfoRecordTable = this.byId('infoRecordTable') as Table;
    oInfoRecordTable.setVisible(false);

    // Clear the current supplier when closing
    this.currentSupplier = null;
  }

  public onConditionSelect(oEvent: Event): void {
    const oTable = oEvent.getSource();
    const oSelectedItem = (oTable as Table).getSelectedItem();

    const oContext = oSelectedItem.getBindingContext('infoRecordData');
    if (!oContext) return;

    // Store the context for later use in price tier checking
    this.currentInfoRecordContext = oContext;

    const sConditionRecord = oContext.getProperty('ConditionRecord') as string;

    if (!sConditionRecord) {
      MessageToast.show('No Condition Record found for this item');
      return;
    }

    // First, show the pricing conditions table (A_PurInfoRecdPrcgCndn) from infoRecord model
    const oPricingConditionsTable = this.byId(
      'pricingConditionsTable',
    ) as Table;
    const oPricingBinding = oPricingConditionsTable.getBinding(
      'items',
    ) as ListBinding;

    // Filter by ConditionRecord to get pricing conditions
    const aPricingFilters = [
      new Filter('ConditionRecord', FilterOperator.EQ, sConditionRecord),
    ];
    oPricingBinding.filter(aPricingFilters);

    // Show pricing conditions table after data is loaded
    oPricingBinding.attachEventOnce('dataReceived', () => {
      oPricingConditionsTable.setVisible(true);
    });

    // Then, show the scale tiers table (A_PurgPrcgCndnRecordScale) from pricingCondition model
    const oScaleTiersTable = this.byId('scaleTiersTable') as Table;
    const oScaleBinding = oScaleTiersTable.getBinding('items') as ListBinding;

    // Filter the scale tiers table by ConditionRecord
    const aScaleFilters = [
      new Filter('ConditionRecord', FilterOperator.EQ, sConditionRecord),
    ];
    oScaleBinding.filter(aScaleFilters);

    // Show the scale tiers table only after data is loaded
    oScaleBinding.attachEventOnce('dataReceived', () => {
      oScaleTiersTable.setVisible(true);
    });

    MessageToast.show(
      `Loading pricing conditions and scale tiers for Condition Record: ${sConditionRecord}`,
    );
  }

  public onCloseScaleTiers(): void {
    const oPricingConditionsTable = this.byId(
      'pricingConditionsTable',
    ) as Table;
    oPricingConditionsTable.setVisible(false);

    const oScaleTiersTable = this.byId('scaleTiersTable') as Table;
    oScaleTiersTable.setVisible(false);
  }

  public async onCheckCurrentPriceTiers(): Promise<void> {
    if (!this.currentInfoRecordContext) {
      MessageBox.error(
        'No info record selected. Please select an info record first.',
      );
      return;
    }

    try {
      MessageToast.show('Fetching current price tiers...');

      // Get the purchasing info record number
      const sPurchasingInfoRecord =
        this.currentInfoRecordContext.getProperty('PurchasingInfoRecord') ?? '';

      // Get the SKU (supplier material number) from the info record
      const oInfoRecordModel = this.getView()?.getModel(
        'infoRecord',
      ) as ODataModel;

      // Read the purchasing info record to get the supplier material number
      const sSku = await this.getSupplierMaterialNumber(
        oInfoRecordModel,
        sPurchasingInfoRecord,
      );

      if (!sSku) {
        MessageBox.error(
          'Could not find supplier material number (SKU) for this info record.',
        );
        return;
      }

      // Prepare the pricing request
      const pricingRequest: GetPricingAndStockBySkuRequest = {
        skuList: [sSku],
        includeStock: true,
      };

      // Get the API name for the supplier
      const supplierApiName = ApiName.find(
        ([supplier]) =>
          supplier === this.currentInfoRecordContext?.getProperty('Supplier'),
      )?.[1];

      if (!supplierApiName) {
        MessageBox.error('No API mapping found for the selected supplier.');
        return;
      }

      // Make the API call
      const response = await fetch(
        'http://localhost:3000/api/get-pricing-and-stock-by-sku',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            supplierName: supplierApiName,
            ...pricingRequest,
          }),
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `API request failed: ${String(response.status)} - ${errorText}`,
        );
      }

      const data = (await response.json()) as GetPricingAndStockBySkuResponse;

      // Display the results
      await this.displayPricingResults(data, sSku);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred';
      MessageBox.error(`Failed to fetch current price tiers:\n${errorMessage}`);
      console.error('Error fetching price tiers:', error);
    }
  }

  private async getSupplierMaterialNumber(
    oModel: ODataModel,
    sPurchasingInfoRecord: string,
  ): Promise<string | null> {
    return new Promise((resolve) => {
      oModel.read(`/A_PurchasingInfoRecord('${sPurchasingInfoRecord}')`, {
        success: (data: ODataRecord) => {
          resolve(data.SupplierMaterialNumber ?? null);
        },
        error: () => {
          resolve(null);
        },
      });
    });
  }

  private async displayPricingResults(
    data: GetPricingAndStockBySkuResponse,
    sSku: string,
  ): Promise<void> {
    if (data.PricingAndStockList.length === 0) {
      MessageBox.warning(`No pricing data found for SKU: ${sSku}`);
      return;
    }

    const pricingInfo = data.PricingAndStockList[0];

    // Check if there are existing scale records
    const hasExistingScaleRecords = await this.checkExistingScaleRecords();

    // Format pricing tiers
    const pricingTiersHtml = pricingInfo.current.pricing
      .map(
        (tier: PricingTier) =>
          `<tr><td style="padding: 5px;">${String(tier.minQuantity)}</td><td style="padding: 5px;">${tier.price.toFixed(2)} ${tier.currency}</td></tr>`,
      )
      .join('');

    // Format availability
    const availabilityHtml = pricingInfo.current.availability
      .map(
        (avail: Availability) =>
          `<tr><td style="padding: 5px;">${String(avail.quantity)}</td><td style="padding: 5px;">${avail.location ?? 'N/A'}</td><td style="padding: 5px;">${String(avail.replenishLeadTimeDays ?? 'N/A')} days</td></tr>`,
      )
      .join('');

    const message = `
      <div style="max-height: 600px; overflow-y: auto; padding: 20px;">
        <h3>Current Price Tiers for ${pricingInfo.supplier} ${sSku}</h3>
        <p><strong>MOQ:</strong> ${String(pricingInfo.current.moq ?? 'N/A')}</p>
        <p><strong>MPQ:</strong> ${String(pricingInfo.current.mpq ?? 'N/A')}</p>
        <p><strong>Captured At:</strong> ${pricingInfo.current.capturedAt ?? 'N/A'}</p>
        ${pricingInfo.current.validUntil ? `<p><strong>Valid Until:</strong> ${pricingInfo.current.validUntil}</p>` : ''}
        
        <h4>Pricing Tiers:</h4>
        <table style="width: 100%; border-collapse: collapse; border: 1px solid #ddd;">
          <thead>
            <tr style="background-color: #f2f2f2;">
              <th style="padding: 8px; text-align: left; border: 1px solid #ddd;">Min Quantity</th>
              <th style="padding: 8px; text-align: left; border: 1px solid #ddd;">Price</th>
            </tr>
          </thead>
          <tbody>
            ${pricingTiersHtml}
          </tbody>
        </table>
        
        ${
          availabilityHtml
            ? `
        <h4>Stock Availability:</h4>
        <table style="width: 100%; border-collapse: collapse; border: 1px solid #ddd; margin-top: 10px;">
          <thead>
            <tr style="background-color: #f2f2f2;">
              <th style="padding: 8px; text-align: left; border: 1px solid #ddd;">Quantity</th>
              <th style="padding: 8px; text-align: left; border: 1px solid #ddd;">Location</th>
              <th style="padding: 8px; text-align: left; border: 1px solid #ddd;">Replenish Lead Time</th>
            </tr>
          </thead>
          <tbody>
            ${availabilityHtml}
          </tbody>
        </table>
        `
            : ''
        }
      </div>
    `;

    const oDialog = new Dialog({
      title: 'Current Price Tiers',
      contentWidth: '600px',
      content: new HTML({
        content: message,
      }),
      beginButton: hasExistingScaleRecords
        ? new Button({
            text: 'Update SAP price tiers',
            type: 'Emphasized',
            press: () => {
              void this.onUpdateSAPPriceTiers(pricingInfo, oDialog);
            },
          })
        : undefined,
      endButton: new Button({
        text: 'Close',
        press: function () {
          oDialog.close();
        },
      }),
      afterClose: function () {
        oDialog.destroy();
      },
    });

    oDialog.open();
  }

  private async checkExistingScaleRecords(): Promise<boolean> {
    if (!this.currentInfoRecordContext) {
      return false;
    }

    const sConditionRecord =
      this.currentInfoRecordContext.getProperty('ConditionRecord') ?? '';

    if (!sConditionRecord) {
      return false;
    }

    const oPricingConditionModel = this.getView()?.getModel(
      'pricingCondition',
    ) as ODataModel;

    try {
      const records = await this.getExistingScaleRecords(
        oPricingConditionModel,
        sConditionRecord,
      );
      return records.length > 0;
    } catch (error) {
      console.error('Error checking existing scale records:', error);
      return false;
    }
  }

  private async onUpdateSAPPriceTiers(
    pricingInfo: GetPricingAndStockBySkuResponse['PricingAndStockList'][0],
    oDialog: Dialog,
  ): Promise<void> {
    if (!this.currentInfoRecordContext) {
      MessageBox.error('No info record selected.');
      return;
    }

    try {
      // Get the necessary information from the current info record
      const sConditionRecord =
        this.currentInfoRecordContext.getProperty('ConditionRecord') ?? '';

      if (!sConditionRecord) {
        MessageBox.error('No Condition Record found for the selected item.');
        return;
      }

      MessageToast.show('Updating SAP price tiers...');

      const oPricingConditionModel = this.getView()?.getModel(
        'pricingCondition',
      ) as ODataModel;

      // Get existing scale records to extract the sequence number
      const existingRecords = await this.getExistingScaleRecords(
        oPricingConditionModel,
        sConditionRecord,
      );

      if (existingRecords.length === 0) {
        MessageBox.error('No existing scale records found to update.');
        return;
      }

      // Store the sequence number and quantity unit (must remain the same)
      const sConditionSequentialNumber =
        existingRecords[0].ConditionSequentialNumber;
      const sConditionScaleQuantityUnit =
        existingRecords[0].ConditionScaleQuantityUnit || 'EA';

      const pricingTiers = pricingInfo.current.pricing;

      // Step 1: Delete all existing scale records in reverse order
      // (to avoid renumbering issues when scale lines are deleted)
      const recordsToDelete = [...existingRecords].sort(
        (a, b) => Number(b.ConditionScaleLine) - Number(a.ConditionScaleLine),
      );

      for (const record of recordsToDelete) {
        await this.deleteScaleRecord(oPricingConditionModel, record);
      }

      // Step 2: Create new scale records with the same sequence number
      for (const tier of pricingTiers) {
        await this.createScaleRecord(
          oPricingConditionModel,
          sConditionRecord,
          sConditionSequentialNumber,
          sConditionScaleQuantityUnit,
          tier,
        );
      }

      MessageBox.success(
        `Successfully updated ${String(pricingTiers.length)} price tier(s) in SAP.`,
        {
          onClose: () => {
            // Refresh the scale tiers table
            const oScaleTiersTable = this.byId('scaleTiersTable') as Table;
            const oBinding = oScaleTiersTable.getBinding(
              'items',
            ) as ListBinding;
            oBinding.refresh();

            // Close the dialog
            oDialog.close();
          },
        },
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred';
      MessageBox.error(`Failed to update SAP price tiers:\n${errorMessage}`);
      console.error('Error updating price tiers:', error);
    }
  }

  private async getExistingScaleRecords(
    oModel: ODataModel,
    sConditionRecord: string,
  ): Promise<
    {
      ConditionRecord: string;
      ConditionSequentialNumber: string;
      ConditionScaleLine: string;
      ConditionScaleQuantityUnit: string;
    }[]
  > {
    return new Promise((resolve, reject) => {
      oModel.read('/A_PurgPrcgCndnRecordScale', {
        filters: [
          new Filter('ConditionRecord', FilterOperator.EQ, sConditionRecord),
        ],
        urlParameters: {
          $orderby: 'ConditionSequentialNumber asc',
        },
        success: (data: {
          results: {
            ConditionRecord: string;
            ConditionSequentialNumber: string;
            ConditionScaleLine: string;
            ConditionScaleQuantityUnit: string;
          }[];
        }) => {
          resolve(data.results);
        },
        error: (error: Error) => {
          reject(error);
        },
      });
    });
  }

  private async deleteScaleRecord(
    oModel: ODataModel,
    record: {
      ConditionRecord: string;
      ConditionSequentialNumber: string;
      ConditionScaleLine: string;
      ConditionScaleQuantityUnit: string;
    },
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const sPath = oModel.createKey('/A_PurgPrcgCndnRecordScale', {
        ConditionRecord: record.ConditionRecord,
        ConditionSequentialNumber: record.ConditionSequentialNumber,
        ConditionScaleLine: record.ConditionScaleLine,
      });

      oModel.remove(sPath, {
        success: () => {
          resolve();
        },
        error: (error: Error) => {
          reject(error);
        },
      });
    });
  }

  private async createScaleRecord(
    oModel: ODataModel,
    sConditionRecord: string,
    sConditionSequentialNumber: string,
    sConditionScaleQuantityUnit: string,
    tier: PricingTier,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const newRecord = {
        ConditionRecord: sConditionRecord,
        ConditionSequentialNumber: sConditionSequentialNumber,
        // ConditionScaleLine is auto-generated by SAP, don't specify it
        ConditionScaleQuantity: String(tier.minQuantity),
        ConditionScaleQuantityUnit: sConditionScaleQuantityUnit,
        ConditionRateValue: String(tier.price),
        ConditionRateValueUnit: tier.currency,
      };

      oModel.create('/A_PurgPrcgCndnRecordScale', newRecord, {
        success: () => {
          resolve();
        },
        error: (error: Error) => {
          reject(error);
        },
      });
    });
  }
}
