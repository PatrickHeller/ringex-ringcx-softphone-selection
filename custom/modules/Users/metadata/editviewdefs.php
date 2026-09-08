<?php
if (!defined('sugarEntry') || !sugarEntry) {
    die('Not A Valid Entry Point');
}

$viewdefs['Users']['EditView'] = array(
    'templateMeta' => array('maxColumns' => '2',
                            'widths' => array(
                                array('label' => '10', 'field' => '30'),
                                array('label' => '10', 'field' => '30')
                            ),
                            'form' => array(
                                'headerTpl'=>'modules/Users/tpls/EditViewHeader.tpl',
                                'footerTpl'=>'modules/Users/tpls/EditViewFooter.tpl',
                            ),
                      ),
    'panels' => array(
        'LBL_USER_INFORMATION' => array(
            array(
                array(
                    'name'=>'user_name',
                    'displayParams' => array('required'=>true),
                    ),
                'first_name'
            ),
            array(array(
                      'name' => 'status',
                      'customCode' => '{if !empty($IS_ADMIN)}@@FIELD@@{else}{$STATUS_READONLY}{/if}',
                  ),
                  'last_name'),
            array(array(
                      'name'=>'UserType',
                      'customCode'=>'{if $IS_ADMIN}{$USER_TYPE_DROPDOWN}{else}{$USER_TYPE_READONLY}{/if}',
                      ),
                ),
            array('photo'),
            array('rc_softphone_type_c'),
        ),
        'LBL_EMPLOYEE_INFORMATION' => array(
            array(array(
                      'name'=>'employee_status',
                      'customCode'=>'{if $IS_ADMIN}@@FIELD@@{else}{$EMPLOYEE_STATUS_READONLY}{/if}',
                  ),
                  'show_on_employees'),
            array(array(
                      'name'=>'title',
                      'customCode'=>'{if $IS_ADMIN}@@FIELD@@{else}{$TITLE_READONLY}{/if}',
                  ),
                  'phone_work'),
            array(array(
                      'name'=>'department',
                      'customCode'=>'{if $IS_ADMIN}@@FIELD@@{else}{$DEPT_READONLY}{/if}',
                  ),
                  'phone_mobile'),
            array(array(
                      'name'=>'reports_to_name',
                      'customCode'=>'{if $IS_ADMIN}@@FIELD@@{else}{$REPORTS_TO_READONLY}{/if}',
                  ),
                  'phone_other'),
            array('','phone_fax'),
            array('','phone_home'),
            array('messenger_type','messenger_id'),
            array('address_street','address_city'),
            array('address_state','address_postalcode'),
            array('address_country'),
            array('description'),
        ),
    ),
);
