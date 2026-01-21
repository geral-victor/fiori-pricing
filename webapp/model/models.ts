import TypedJSONModel from 'sap/ui/model/json/TypedJSONModel';
import Device from 'sap/ui/Device';

export function createDeviceModel() {
  const model = new TypedJSONModel(Device);
  model.setDefaultBindingMode('OneWay');
  return model;
}
