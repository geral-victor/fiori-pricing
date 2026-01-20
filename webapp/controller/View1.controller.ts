import Controller from 'sap/ui/core/mvc/Controller';
import JSONModel from 'sap/ui/model/json/JSONModel';
import MessageToast from 'sap/m/MessageToast';
import MessageBox from 'sap/m/MessageBox';
import Input from 'sap/m/Input';
import type {
  GetSkuByManufacturerAndMpnRequestBody,
  GetSkuByManufacturerAndMpnResponseBody,
} from '@GERAL-STT/component-pricing-api';

/**
 * @namespace project1.controller
 */
export default class View1 extends Controller {
  public onInit(): void {
    const oModel = new JSONModel({
      results: [],
      loading: false,
    });
    this.getView()?.setModel(oModel, 'componentData');
  }

  public async onSearch(): Promise<void> {
    const oInput = this.byId('componentInput') as Input;
    const sQuery = oInput.getValue().trim();

    if (!sQuery) {
      MessageToast.show('Please enter a component query');
      return;
    }

    const oModel = this.getView()?.getModel('componentData') as JSONModel;
    oModel.setProperty('/loading', true);
    oModel.setProperty('/results', []);

    try {
      const requestBody: GetSkuByManufacturerAndMpnRequestBody = {
        query: sQuery,
      };

      MessageToast.show('Searching for component...');

      const startTime = performance.now();
      const response = await fetch(
        'http://localhost:3000/api/get-sku-by-manufacturer-and-mpn',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
        },
      );
      const endTime = performance.now();
      const fetchingTime = endTime - startTime;

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `API request failed: ${String(response.status)} - ${errorText}`,
        );
      }

      const data =
        (await response.json()) as unknown as GetSkuByManufacturerAndMpnResponseBody;

      if (data.skuList.length > 0) {
        oModel.setProperty('/results', data.skuList);
        
        MessageToast.show(
          `Found ${String(data.skuList.length)} component(s) in ${(fetchingTime / 1000).toFixed(2)}s`,
        );
      } else {
        MessageBox.information('No components found for the given query.');
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred';
      MessageBox.error(`Failed to search components:\n${errorMessage}`);
      console.error('Error searching components:', error);
    } finally {
      oModel.setProperty('/loading', false);
    }
  }
}
